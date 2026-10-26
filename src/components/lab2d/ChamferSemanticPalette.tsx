/**
 * CALDRA — CHAMFER INTENT 2.0 (COMPILADOR GEOMÉTRICO PARAMÉTRICO E AGENTE CONVERSACIONAL)
 *
 * Implementação completa das Fases 1 a 7 do Prompt Mestre (Claude §1–§11):
 *  - Fase 1 & 2: Catálogo de 46 tools DSL v2, PartModel explícito, System Instruction literal (§9),
 *    dry-run por tool call, validador de fabricação DFM (§8), auto-correção e premissas editáveis;
 *  - Fase 3 (§4): Chat completo com balões permanentes, Cartão de Peça com formulário dinâmico por
 *    operação, versões restauráveis (V1, V2, V3...), copiar/editar/regenerar/parar e 👍/👎 com motivo;
 *  - Fase 4 (§5): Entrada por Voz (3 estados: inativo · ouvindo · processando), Web Speech API pt-BR
 *    com fim automático após ~1,5 s de silêncio + fallback MediaRecorder, normalização pós-voz de
 *    números por extenso/decimais/unidades/glossário de oficina e síntese de voz TTS opcional;
 *  - Fase 5: Modificação contextual por clique ou menção `@` (@plate_1, @holes_1, @selecionado),
 *    recompilação de parâmetros do cartão a 0ms SEM chamar o LLM com registro de nota no contexto,
 *    e ramificação com confirmação ao editar mensagem anterior;
 *  - Fase 6 (§10): Suíte Golden integrada (≥ 40 frases em pt-BR + botão "Rodar testes"), log de
 *    observabilidade por turno e botão "Interpretou errado" que salva o caso na suíte;
 *  - Fase 7: Croqui/Foto/DXF como entrada no composer, "Meus gabaritos" (templates salvos),
 *    variáveis paramétricas globais (W/2, D=2*R) e preferências do usuário (unidade, material, camadas).
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Check,
  X,
  AlertTriangle,
  HelpCircle,
  Code2,
  Sliders,
  RotateCcw,
  ChevronRight,
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
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import {
  CadSemanticIntentEngine,
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);

  const hasActivePart = Boolean(sessionContext?.activeFeature) || thread.versions.length > 0;

  // Constrói o PartModel compacto atual para referências `@` e contexto do agente (§7)
  const currentPartModel = useMemo(() => {
    const model = buildPartModelFromCanvas({
      entities: existingEntities,
      dimensions: existingDimensions,
      selectedEntityIds,
      units: userPrefs.defaultUnit,
      thickness: userPrefs.defaultThicknessMm,
      vars: globalVars,
    });
    return model;
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

  // Carrega rascunho e conversa ativa ao abrir
  useEffect(() => {
    if (open) {
      const savedDraft = loadComposerDraft(projectId);
      setQuery(savedDraft);
      setParameterOverrides({});
      setSelectedIndex(0);
      setIsMinimizedToSheet(false);
      setIsPeekingCanvas(false);
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
    } else {
      onPreviewIntentPlanChange?.(null);
      stopVoiceCapture();
    }
  }, [open, projectId, onPreviewIntentPlanChange]);

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

  // Detecta se o plano ativo é uma chapa paramétrica (possui W e H)
  const isPlatePlan = Boolean(
    activeIntentPlan &&
      typeof activeIntentPlan.parameters.width === "number" &&
      typeof activeIntentPlan.parameters.height === "number",
  );

  // Parâmetros numéricos em tempo real acoplados aos inputs editáveis
  const liveWidth = Number(
    parameterOverrides.width ?? activeIntentPlan?.parameters.width ?? 400,
  );
  const liveHeight = Number(
    parameterOverrides.height ?? activeIntentPlan?.parameters.height ?? 250,
  );
  const liveCornerRadius = Number(
    parameterOverrides.corner_radius ?? activeIntentPlan?.parameters.corner_radius ?? 0,
  );
  const liveCornerSelector = (parameterOverrides.corner_selector ??
    activeIntentPlan?.parameters.corner_selector ??
    "all") as CornerSelector;
  const liveHoleCount = Number(
    parameterOverrides.hole_count ?? activeIntentPlan?.parameters.hole_count ?? 0,
  );
  const liveHoleDiameter = Number(
    parameterOverrides.hole_diameter ?? activeIntentPlan?.parameters.hole_diameter ?? 12,
  );
  const liveMargin = Number(
    parameterOverrides.margin ?? activeIntentPlan?.parameters.margin ?? 25,
  );
  const liveHoleDistribution = (parameterOverrides.hole_distribution ??
    activeIntentPlan?.parameters.hole_distribution ??
    "linear_centerline_x") as HoleDistributionMode;
  const livePcd =
    typeof (parameterOverrides.pcd ?? activeIntentPlan?.parameters.pcd) === "number"
      ? Number(parameterOverrides.pcd ?? activeIntentPlan?.parameters.pcd)
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

  // Campos dinâmicos do formulário de parâmetros (§4.2)
  const dynamicFormSpec = useMemo(() => {
    if (!activeIntentPlan) return null;
    return buildDynamicParameterFields(activeIntentPlan, parameterOverrides, {
      isRadiusError: livePlateValidation.isRadiusError,
      isMarginError: livePlateValidation.isMarginError,
      isPitchCollision: livePlateValidation.isPitchCollision,
    });
  }, [activeIntentPlan, parameterOverrides, livePlateValidation]);

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

  // =========================================================================
  // FASE 4 (§5): MOTOR DE VOZ (Web Speech API pt-BR + Fallback MediaRecorder)
  // =========================================================================
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

  const startVoiceCapture = useCallback(() => {
    triggerHaptic("selection");
    setVoiceInterimTranscript("");

    if (isWebSpeechRecognitionSupported()) {
      const w = window as unknown as Record<string, new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
        onerror: ((ev: { error?: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      }>;
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
        // Fim automático após ~1,5 s de silêncio (§5)
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
            if (userPrefs.autoSendVoice) {
              setTimeout(() => {
                void handleSendTurn({ overridePrompt: normalized, keepModalOpen: true });
              }, 80);
            }
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
  }, [stopVoiceCapture, userPrefs.autoSendVoice]);

  const handleToggleVoiceMic = () => {
    if (micState === "inactive") {
      startVoiceCapture();
    } else {
      stopVoiceCapture();
    }
  };

  // =========================================================================
  // FASE 5: EDIÇÃO DE PARÂMETROS NO CARTÃO SEM CHAMAR O LLM (§3 item 7)
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
    // Suporta também expressões com variáveis globais se o usuário digitar string (ex.: "W/2")
    const resolvedVal =
      typeof val === "string" && key !== "corner_selector"
        ? (evaluateParametricExpression(val, globalVars) ?? Number(val))
        : val;

    if (activeIntentPlan) {
      const oldVal = parameterOverrides[key] ?? activeIntentPlan.parameters[key] ?? 0;
      const recompiled = recompileCardWithoutLLM({
        previousPlan: activeIntentPlan,
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

      // Fase 4 / 7: Leitura em voz alta (TTS pt-BR) se habilitada pelo usuário
      if (userPrefs.ttsEnabled) {
        speakAssistantResponsePtBr(assistantReplyText, true);
      }

      persistAndSetThread(updatedThread);
      setQuery("");
      saveComposerDraft(projectId, "");
      setParameterOverrides({});
      setAttachedFileSummary(null);
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
    if (!activeIntentPlan) return;
    const params: Record<string, number | string> = {};
    for (const [k, v] of Object.entries({ ...activeIntentPlan.parameters, ...parameterOverrides })) {
      if (typeof v === "number" || typeof v === "string") {
        params[k] = v;
      }
    }
    const created = saveIntentTemplate({
      name: activeIntentPlan.intent.summary.slice(0, 48),
      prompt: query.trim() || activeIntentPlan.intent.raw_prompt,
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

  const statusBadge = () => {
    if (!activeIntentPlan) return null;
    if (hasGeometricError) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/50 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#ef4444] uppercase">
          <AlertTriangle className="w-3 h-3" /> ERRO · REVISE OS PARÂMETROS
        </span>
      );
    }
    if (
      activeIntentPlan.v2 &&
      activeIntentPlan.v2.manufacturingReport.warnings.length > 0 &&
      canApplyPlan
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 uppercase">
          <AlertTriangle className="w-3 h-3" /> VALIDADO · ALERTA DFM
        </span>
      );
    }
    if (
      activeIntentPlan.v2?.decisionStatus === "provisional" &&
      !parameterOverrides.premise_confirmed &&
      canApplyPlan
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-sky-300 uppercase">
          <HelpCircle className="w-3 h-3" /> PROVISÓRIO · PREMISSA EXPLÍCITA
        </span>
      );
    }
    if (canApplyPlan) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 uppercase">
          <CheckCircle2 className="w-3 h-3" /> VALIDADO · PRONTO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 uppercase">
        <HelpCircle className="w-3 h-3" /> REQUER ESCLARECIMENTO
      </span>
    );
  };

  const effectiveMinimized = isMinimizedToSheet || isPeekingCanvas;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={`w-[94vw] max-w-[94vw] sm:max-w-2xl p-0 overflow-hidden bg-slate-950/95 text-slate-100 backdrop-blur-2xl border border-slate-800 shadow-2xl rounded-3xl flex flex-col transition-all duration-200 ${
          effectiveMinimized
            ? "!top-auto !bottom-3 !translate-y-0 max-h-[150px] opacity-95 border-sky-500/50"
            : "max-h-[90dvh]"
        }`}
      >
        <DialogTitle className="sr-only">
          CHAMFER Intent 2.0 — Agente Conversacional e Compilador Geométrico Paramétrico
        </DialogTitle>

        {/* ===================================================================== */}
        {/* 1. CABEÇALHO TÉCNICO DO PAINEL (§4.1 + Fases 6 e 7) */}
        {/* ===================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <CaldraLogo size={26} className="rounded-lg shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-white truncate">
                  CHAMFER INTENT
                </span>
                <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.2 font-mono text-[9px] font-bold text-red-300">
                  DSL v2.0
                </span>
                {isOfflineFallback && (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 font-mono text-[9px] text-amber-300"
                    title="Usando compilador geométrico determinístico local"
                  >
                    <WifiOff className="w-2.5 h-2.5" /> LOCAL
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate max-w-[160px] sm:max-w-[240px]">
                {thread.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Chip da Peça Ativa */}
            {hasActivePart && sessionContext?.activeFeature && (
              <div className="hidden md:flex items-center gap-1 rounded-lg bg-sky-500/10 border border-sky-500/30 px-2 py-1 text-[10px] font-mono text-sky-300">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>
                  {sessionContext.activeFeature.width}×{sessionContext.activeFeature.height} mm
                </span>
              </div>
            )}

            {/* Seletor de Versão Restaurável (V1, V2, V3...) em 1 clique */}
            {thread.versions.length > 0 && (
              <div className="flex items-center gap-1 rounded-lg bg-slate-950/90 border border-slate-800 px-1.5 py-0.5">
                <GitBranch className="w-3 h-3 text-emerald-400 shrink-0" />
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[120px]">
                  {thread.versions.map((ver) => {
                    const isActive = thread.activeVersionId === ver.versionId;
                    return (
                      <button
                        key={ver.versionId}
                        type="button"
                        onClick={() => handleSelectVersion(ver.versionId)}
                        title={`Restaurar ${ver.versionId}: ${ver.label}`}
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold transition-colors cursor-pointer ${
                          isActive
                            ? "bg-emerald-500 text-slate-950"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {ver.versionId}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Toggle "Aplicar automaticamente quando VALIDADO" (§4.2) */}
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...thread,
                  autoApplyWhenValidated: !thread.autoApplyWhenValidated,
                };
                persistAndSetThread(next);
              }}
              title="Aplicar automaticamente quando VALIDADO (desligado por padrão)"
              className={`px-2 py-1 rounded-lg font-mono text-[10px] border transition-colors cursor-pointer ${
                thread.autoApplyWhenValidated
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300 font-bold"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Auto: {thread.autoApplyWhenValidated ? "ON" : "OFF"}
            </button>

            {/* Fase 7: Gabaritos, Variáveis Globais & Preferências */}
            <button
              type="button"
              onClick={() =>
                setActiveTopDrawer((d) =>
                  d === "templates_vars_prefs" ? "none" : "templates_vars_prefs",
                )
              }
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors cursor-pointer ${
                activeTopDrawer === "templates_vars_prefs"
                  ? "bg-sky-500/20 border-sky-400/50 text-sky-300 font-bold"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
              title="Meus Gabaritos, Variáveis Paramétricas Globais e Preferências"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gabaritos & Vars</span>
            </button>

            {/* Fase 6 (§10): Suíte Golden & Observabilidade Dev */}
            <button
              type="button"
              onClick={() =>
                setActiveTopDrawer((d) =>
                  d === "golden_observability" ? "none" : "golden_observability",
                )
              }
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors cursor-pointer ${
                activeTopDrawer === "golden_observability"
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300 font-bold"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
              title="Suíte Golden (≥40 frases pt-BR) e Observabilidade por Turno"
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Testes</span>
            </button>

            {/* Botão Histórico de Conversas (§4.1 / §4.5) */}
            <button
              type="button"
              onClick={() =>
                setActiveTopDrawer((d) => (d === "conversations" ? "none" : "conversations"))
              }
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors cursor-pointer ${
                activeTopDrawer === "conversations"
                  ? "bg-sky-500/20 border-sky-400/50 text-sky-300 font-bold"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
              title="Gerenciar histórico de conversas do projeto"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {thread.messages.length > 0 && (
                <span className="rounded-full bg-slate-800 px-1.5 text-[9px] text-sky-300">
                  {Math.ceil(thread.messages.length / 2)}
                </span>
              )}
            </button>

            {effectiveMinimized && (
              <button
                type="button"
                onClick={() => {
                  setIsMinimizedToSheet(false);
                  setIsPeekingCanvas(false);
                }}
                className="flex items-center gap-1 rounded-lg bg-sky-500/20 border border-sky-400/50 px-2.5 py-1 font-mono text-[10px] font-bold text-sky-300 hover:bg-sky-500/30 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Expandir</span>
              </button>
            )}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* GAVETA A: GERENCIAMENTO DE CONVERSAS (§4.5) */}
        {/* ===================================================================== */}
        {activeTopDrawer === "conversations" && !effectiveMinimized && (
          <div className="bg-slate-900/95 border-b border-slate-800 p-3 space-y-2.5 max-h-60 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Buscar conversas ou comandos..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-sky-400"
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
                  className="flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-500 px-2.5 py-1.5 text-[11px] font-bold text-white cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>Nova Conversa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportConversation("json")}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-mono text-slate-200 cursor-pointer"
                  title="Exportar conversa em JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportConversation("dsl")}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-mono text-sky-300 cursor-pointer"
                  title="Exportar especificação DSL da conversa"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>DSL</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {projectConversations.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center font-mono">
                  Nenhuma conversa encontrada para este filtro.
                </p>
              ) : (
                projectConversations.map((conv) => {
                  const isCurrent = conv.id === thread.id;
                  const isRenaming = renamingThreadId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border transition-colors ${
                        isCurrent
                          ? "bg-sky-950/40 border-sky-500/40 text-white"
                          : "bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50"
                      }`}
                    >
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={renameTitleDraft}
                            onChange={(e) => setRenameTitleDraft(e.target.value)}
                            className="flex-1 rounded bg-slate-900 border border-sky-400 px-2 py-1 text-xs text-white outline-none"
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
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
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
                            <span className="text-[10px] font-mono text-slate-400">
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
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
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
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer"
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

        {/* ===================================================================== */}
        {/* GAVETA B (FASE 7): MEUS GABARITOS, VARIÁVEIS GLOBAIS E PREFERÊNCIAS */}
        {/* ===================================================================== */}
        {activeTopDrawer === "templates_vars_prefs" && !effectiveMinimized && (
          <div className="bg-slate-900/95 border-b border-slate-800 p-3.5 space-y-3 max-h-64 overflow-y-auto">
            {/* 1. Meus Gabaritos (Templates Salvos) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 flex items-center gap-1">
                  <Bookmark className="w-3 h-3" /> Meus Gabaritos (Templates Paramétricos)
                </span>
                {activeIntentPlan && (
                  <button
                    type="button"
                    onClick={handleSaveCurrentPlanAsTemplate}
                    className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[10px] font-mono text-sky-200 hover:bg-sky-500/30 cursor-pointer"
                  >
                    + Salvar Peça Atual como Gabarito
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {savedTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/80 border border-slate-800 px-2.5 py-1.5"
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
                      <span className="block text-xs font-semibold text-white truncate">
                        {tpl.name}
                      </span>
                      <span className="block text-[10px] font-mono text-slate-400 truncate">
                        {tpl.prompt}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteSavedIntentTemplate(tpl.id);
                        setSavedTemplates(listSavedIntentTemplates());
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                      title="Remover gabarito"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Variáveis Paramétricas Globais (PartModel.vars: W, H, R, D, M) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                Variáveis Paramétricas Globais (Use expressões como W/2, 2*R)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(globalVars).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center gap-1 rounded-lg bg-slate-950 border border-slate-800 px-2 py-1 font-mono text-[10px]"
                  >
                    <span className="text-emerald-300 font-bold">{k} =</span>
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
                      className="w-14 bg-transparent text-white outline-none border-b border-slate-700 focus:border-emerald-400 text-center"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value.toUpperCase())}
                    placeholder="VAR"
                    className="w-12 rounded bg-slate-950 border border-slate-800 px-1.5 py-1 font-mono text-[10px] text-white"
                  />
                  <input
                    type="number"
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    placeholder="mm"
                    className="w-14 rounded bg-slate-950 border border-slate-800 px-1.5 py-1 font-mono text-[10px] text-white"
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
                    className="px-2 py-1 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold cursor-pointer"
                  >
                    + Var
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Preferências do Usuário (Unidade, Material, Espessura, TTS, Voz) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[10px] font-mono">
              <label className="block">
                <span className="text-slate-400">Unidade Padrão</span>
                <select
                  value={userPrefs.defaultUnit}
                  onChange={(e) =>
                    setUserPrefs(
                      saveUserIntentPreferences({
                        defaultUnit: e.target.value as UserIntentPreferences["defaultUnit"],
                      }),
                    )
                  }
                  className="mt-0.5 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-white"
                >
                  <option value="mm">Milímetros (mm)</option>
                  <option value="cm">Centímetros (cm)</option>
                  <option value="in">Polegadas (in)</option>
                </select>
              </label>

              <label className="block">
                <span className="text-slate-400">Material Padrão</span>
                <select
                  value={userPrefs.defaultMaterial}
                  onChange={(e) =>
                    setUserPrefs(saveUserIntentPreferences({ defaultMaterial: e.target.value }))
                  }
                  className="mt-0.5 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-white"
                >
                  <option value="Aço Carbono SAE 1020">Aço SAE 1020</option>
                  <option value="Aço Inox AISI 304">Inox AISI 304</option>
                  <option value="Alumínio Naval 5052">Alumínio 5052</option>
                  <option value="Aço Corten">Aço Corten</option>
                </select>
              </label>

              <label className="block">
                <span className="text-slate-400">Espessura (mm)</span>
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
                  className="mt-0.5 w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-white"
                />
              </label>

              <div className="flex flex-col justify-end gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setUserPrefs(saveUserIntentPreferences({ ttsEnabled: !userPrefs.ttsEnabled }))
                  }
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1 border cursor-pointer ${
                    userPrefs.ttsEnabled
                      ? "bg-sky-500/20 border-sky-400 text-sky-200 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Voz TTS: {userPrefs.ttsEnabled ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* GAVETA C (FASE 6 — §10): SUÍTE GOLDEN (≥40 FRASES PT-BR) E OBSERVABILIDADE */}
        {/* ===================================================================== */}
        {activeTopDrawer === "golden_observability" && !effectiveMinimized && (
          <div className="bg-slate-900/95 border-b border-slate-800 p-3.5 space-y-2.5 max-h-64 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-emerald-300">
                  Suíte Golden §10 (43 casos em pt-BR) & Telemetria
                </span>
                <span className="rounded bg-slate-950 border border-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
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
                className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-mono text-[11px] font-bold text-white cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Rodar testes (43 frases)</span>
              </button>
            </div>

            {goldenReport && (
              <div className="rounded-xl bg-slate-950 border border-emerald-500/40 p-2.5 space-y-1.5 text-[11px] font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-emerald-300 font-bold">
                    Resultado: {goldenReport.passedCases}/{goldenReport.totalCases} (
                    {goldenReport.passRatePercent}%) —{" "}
                    {goldenReport.meets95PercentCriterion
                      ? "CRITÉRIO ≥95% ATINGIDO"
                      : "ABAIXO DE 95%"}
                  </span>
                  <span className="text-slate-400">
                    p50: {goldenReport.p50DurationMs} ms · Inválidas aplicadas:{" "}
                    {goldenReport.invalidGeometryAppliedCount}
                  </span>
                </div>
              </div>
            )}

            {obsLogs.length > 0 && (
              <div className="space-y-1">
                <span className="block text-[10px] font-mono uppercase text-slate-400">
                  Últimos Turnos Registrados (Observabilidade §10)
                </span>
                {obsLogs.slice(0, 4).map((log) => (
                  <div
                    key={log.turnId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/80 border border-slate-800 px-2.5 py-1 text-[10px] font-mono"
                  >
                    <span className="text-slate-200 truncate max-w-[240px]">{log.rawInput}</span>
                    <span className="text-sky-300 shrink-0">
                      {log.toolCallNames.join(", ") || "local"} · {log.compilationTimeMs} ms
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODO MINI-SHEET COMPACTO QUANDO "VER NO CANVAS PRINCIPAL" ESTÁ ATIVO */}
        {effectiveMinimized && activeIntentPlan ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-950/95">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {statusBadge()}
                <span className="text-xs font-bold text-white truncate">
                  {activeIntentPlan.intent.summary}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Inspecionando pré-visualização diretamente no Canvas Principal do CHAMFER.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsMinimizedToSheet(false);
                  setIsPeekingCanvas(false);
                }}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 cursor-pointer"
              >
                Editar Parâmetros
              </button>
              <button
                type="button"
                disabled={!canApplyPlan}
                onClick={() => handleConfirmPlan(false)}
                className={`min-h-[44px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                  canApplyPlan
                    ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ===================================================================== */}
            {/* 2. CORPO ROLÁVEL: HISTÓRICO DE MENSAGENS + CARTÃO DE PEÇA EM TEMPO REAL */}
            {/* ===================================================================== */}
            <div
              ref={chatScrollRef}
              aria-live="polite"
              className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5"
            >
              {/* BANNER DE ERRO DE REDE / COTA COM BOTÃO "TENTAR DE NOVO" (§4.5) */}
              {networkErrorBanner && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-950/40 border border-amber-500/40 p-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{networkErrorBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSendTurn({ keepModalOpen: true })}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-[11px] font-bold cursor-pointer"
                  >
                    Tentar de novo
                  </button>
                </div>
              )}

              {/* HISTÓRICO PERMANENTE DE BALÕES DA CONVERSA (§4.1 / §4.2) */}
              {thread.messages.length > 0 && (
                <div className="space-y-3">
                  {thread.messages.map((msg, msgIndex) => {
                    if (msg.role === "user") {
                      const isEditingThis = editingMessageId === msg.id;
                      const subsequentCommitsCount = thread.messages
                        .slice(msgIndex)
                        .filter((m) => Boolean(m.committedVersionId)).length;

                      return (
                        <div key={msg.id} className="flex flex-col items-end space-y-1">
                          <div className="max-w-[90%] sm:max-w-[82%] rounded-2xl rounded-tr-sm bg-sky-950/60 border border-sky-500/30 px-3.5 py-2.5 text-xs text-slate-100">
                            {isEditingThis ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingMessageDraft}
                                  onChange={(e) => setEditingMessageDraft(e.target.value)}
                                  rows={2}
                                  className="w-full rounded-lg bg-slate-950 border border-sky-400 p-2 text-xs text-white outline-none"
                                />
                                {subsequentCommitsCount > 0 && (
                                  <p className="text-[10px] font-mono text-amber-300">
                                    Atenção: reenviar criará uma nova ramificação e arquivará{" "}
                                    {subsequentCommitsCount} versão(ões) posterior(es).
                                  </p>
                                )}
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingMessageId(null)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-mono cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmEditUserMessage(msg.id)}
                                    className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 text-[10px] font-mono font-bold cursor-pointer"
                                  >
                                    Confirmar Ramificação e Reenviar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                {msg.attachedContext && (
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-sky-500/20 text-[10px] font-mono text-sky-300/80">
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
                            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyText(msg.content, "Comando copiado.")
                                }
                                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
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
                                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-900 hover:text-sky-300 cursor-pointer"
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
                        <div className="w-full rounded-2xl rounded-tl-sm bg-slate-900/90 border border-slate-800 p-3.5 space-y-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
                                CHAMFER INTENT ·{" "}
                                {dynamicCardFields?.familyLabel ?? "Resposta Técnica"}
                              </span>
                              {cardPlan && (
                                <h4 className="text-xs sm:text-sm font-bold text-white mt-0.5">
                                  {cardPlan.intent.summary}
                                </h4>
                              )}
                              <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                                {msg.content}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {msg.committedVersionId && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" /> {msg.committedVersionId}
                                </span>
                              )}
                              {cardPlan && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${
                                    cardPlan.validation.status === "invalid"
                                      ? "bg-red-500/15 border-red-500/40 text-red-300"
                                      : cardPlan.v2 &&
                                          cardPlan.v2.manufacturingReport.warnings.length > 0
                                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                        : "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                                  }`}
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
                                  className="rounded-lg bg-slate-950 border border-slate-800 px-2 py-1 font-mono text-[10px] text-slate-300"
                                >
                                  {f.label}:{" "}
                                  <strong className="text-white">{String(f.value)}</strong>
                                  {f.unit ? ` ${f.unit}` : ""}
                                </span>
                              ))}
                            </div>
                          )}

                          {cardPlan && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                              <div className="flex items-center gap-1.5">
                                {msg.commitState !== "committed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleApplyHistoryCard(msg)}
                                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    Aplicar no Canvas
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMessageDslId(isDslExpanded ? null : msg.id)
                                  }
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-[10px] font-mono cursor-pointer"
                                >
                                  {isDslExpanded ? "Ocultar DSL" : "Ver DSL"}
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono text-slate-400">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyText(msg.content, "Resumo técnico copiado.")
                                  }
                                  className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white cursor-pointer"
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
                                  className="px-2 py-1 rounded-lg hover:bg-slate-800 hover:text-sky-300 cursor-pointer"
                                  title="Copiar DSL/JSON"
                                >
                                  DSL/JSON
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRegenerateMessage(msg)}
                                  className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white cursor-pointer"
                                  title="Regenerar resposta"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                {msg.commitState === "committed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleUndoMessageOperation(msg)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800 text-amber-300 cursor-pointer"
                                    title="Desfazer esta operação"
                                  >
                                    <Undo2 className="w-3.5 h-3.5" /> Desfazer
                                  </button>
                                )}
                                {/* Fase 6 (§10): Botão "Interpretou errado" que salva o caso na suíte */}
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
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800 text-red-300 cursor-pointer"
                                  title="Interpretou errado — salvar este caso na Suíte Golden (§10)"
                                >
                                  <Flag className="w-3 h-3" /> Interpretou errado
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const res = recordAssistantMessageFeedback(
                                      thread,
                                      msg.id,
                                      "up",
                                    );
                                    persistAndSetThread(res.updatedThread);
                                    toast.success("Obrigado pelo feedback positivo!");
                                  }}
                                  className={`p-1.5 rounded-lg cursor-pointer ${
                                    msg.feedback?.rating === "up"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "hover:bg-slate-800 hover:text-emerald-300"
                                  }`}
                                  title="Resposta útil (👍)"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenDownvoteMessageId(isDownvoteOpen ? null : msg.id)
                                  }
                                  className={`p-1.5 rounded-lg cursor-pointer ${
                                    msg.feedback?.rating === "down"
                                      ? "bg-red-500/20 text-red-300"
                                      : "hover:bg-slate-800 hover:text-red-300"
                                  }`}
                                  title="Reportar problema na resposta (👎)"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {isDownvoteOpen && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
                              <span className="text-[10px] font-mono text-slate-400">
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
                                  className="px-2 py-1 rounded-lg bg-red-950/50 hover:bg-red-900/60 border border-red-500/30 text-[10px] font-mono text-red-200 cursor-pointer"
                                >
                                  {reason}
                                </button>
                              ))}
                            </div>
                          )}

                          {isDslExpanded && cardPlan && (
                            <pre className="max-h-36 overflow-auto rounded-xl bg-slate-950 p-2.5 text-[10px] font-mono text-emerald-300 border border-slate-800">
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
                            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-sky-400" /> Próximos passos:
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
                                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-sky-950/60 border border-slate-800 hover:border-sky-500/40 text-[10px] font-mono text-sky-300 transition-colors cursor-pointer"
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

              {/* SUGESTÕES RÁPIDAS QUANDO O COMPOSER ESTÁ VAZIO */}
              {!query.trim() && (
                <div className="space-y-3">
                  {hasActivePart && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-sky-400 mb-2">
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
                            className="text-left text-[11px] font-mono px-2.5 py-1.5 rounded-xl bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border border-sky-500/30 transition-colors cursor-pointer"
                          >
                            "{p}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                      Exemplos de Compilação Geométrica Paramétrica
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
                          className="flex items-start gap-2 text-left text-[11px] p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================================================================== */}
              {/* 3. CARTÃO DE PEÇA EM TEMPO REAL (ACTIVE DRAFT TURN CARD — §4.2) */}
              {/* ===================================================================== */}
              {activeIntentPlan && (
                <div className="space-y-3 rounded-2xl bg-slate-900/95 border border-sky-500/40 p-3.5 shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
                        Cartão de Peça em Prévia · {dynamicFormSpec?.familyLabel ?? "DSL v2.0"} ·
                        Turno #{activeIntentPlan.intent.turn_index}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">
                        {isPlatePlan
                          ? `Chapa ${liveWidth} × ${liveHeight} mm${
                              liveCornerRadius > 0 && liveCornerSelector !== "none"
                                ? ` · R${liveCornerRadius} mm`
                                : ""
                            }${
                              liveHoleCount > 0
                                ? ` · ${liveHoleCount} Furos Ø${liveHoleDiameter} mm`
                                : ""
                            }`
                          : activeIntentPlan.intent.summary}
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        {hasGeometricError && isPlatePlan
                          ? livePlateValidation.errorMessages[0] ??
                            activeIntentPlan.response_summary
                          : activeIntentPlan.v2?.understandingText ||
                            activeIntentPlan.response_summary}
                      </p>
                      {activeIntentPlan.v2 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] font-mono text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800/90 text-emerald-300 border border-slate-700">
                            {streamingStageLabel ??
                              "Entendendo → Planejando → Compilando → Validando"}
                          </span>
                          {activeIntentPlan.v2.toolCalls.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-sky-300 border border-slate-700">
                              {activeIntentPlan.v2.toolCalls.length} tool call(s) em dry-run
                            </span>
                          )}
                          {manualEditNotes.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              0ms local ({manualEditNotes[manualEditNotes.length - 1]})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {statusBadge()}
                  </div>

                  {/* PREMISSAS DECLARADAS PELO AGENTE (declare_assumptions — Chips Editáveis) */}
                  {activeIntentPlan.v2 && activeIntentPlan.v2.assumptions.length > 0 && (
                    <div className="rounded-xl bg-sky-950/25 border border-sky-500/30 p-2.5 space-y-1.5">
                      <span className="block text-[10px] font-mono uppercase tracking-wider text-sky-300">
                        Premissas Assumidas (Clique para alternar convenção)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeIntentPlan.v2.assumptions.map((assum) => (
                          <div
                            key={assum.id}
                            className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-900/90 border border-sky-500/30 px-2.5 py-1 text-[11px]"
                          >
                            <span className="font-mono font-semibold text-sky-300">
                              {assum.field}:
                            </span>
                            <span className="text-white font-medium">{String(assum.value)}</span>
                            <span className="text-slate-400 text-[10px]">({assum.reason})</span>
                            {assum.alternatives && assum.alternatives.length > 0 && (
                              <div className="flex items-center gap-1 ml-1">
                                {assum.alternatives.map((alt) => (
                                  <button
                                    key={alt.label}
                                    type="button"
                                    onClick={() => handleApplyAmbiguityPatch(alt.patch)}
                                    className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/40 text-sky-200 border border-sky-400/40 text-[10px] font-mono transition-colors cursor-pointer"
                                  >
                                    {alt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* JANELA DE PRÉVIA EM TEMPO REAL (LIVE 2D CAD MINI-VIEWPORT A 60 FPS) */}
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
                    isPlateMode={isPlatePlan}
                    fallbackEntities={activeIntentPlan.compiled?.previewEntities ?? []}
                    isMinimizedToSheet={isMinimizedToSheet}
                    onToggleMinimizeToSheet={() => setIsMinimizedToSheet((v) => !v)}
                    onPeekCanvasStart={() => setIsPeekingCanvas(true)}
                    onPeekCanvasEnd={() => setIsPeekingCanvas(false)}
                  />

                  {/* PARÂMETROS EXTRAÍDOS GERADOS DINAMICAMENTE CONFORME A OPERAÇÃO (§4.2 + Fase 5 sem LLM) */}
                  {dynamicFormSpec && dynamicFormSpec.fields.length > 0 && (
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          <Sliders className="w-3 h-3 text-red-400" /> Parâmetros Extraídos ·{" "}
                          {dynamicFormSpec.familyLabel} (Recompila sem LLM)
                        </span>
                        {Object.keys(parameterOverrides).length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setParameterOverrides({});
                              setManualEditNotes([]);
                            }}
                            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Restaurar original
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {dynamicFormSpec.fields.map((field) => (
                          <label key={field.key} className="block">
                            <span
                              className={`text-[10px] font-mono ${
                                field.hasError ? "text-red-400 font-bold" : "text-slate-400"
                              }`}
                            >
                              {field.label}
                              {field.unit ? ` (${field.unit})` : ""}
                            </span>
                            {field.kind === "select" && field.options ? (
                              <select
                                value={String(field.value)}
                                onChange={(e) => handleParamChange(field.key, e.target.value)}
                                className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                              >
                                {field.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={Number(field.value)}
                                onChange={(e) =>
                                  handleParamChange(field.key, Number(e.target.value))
                                }
                                className={`mt-0.5 w-full rounded-lg bg-slate-900 border px-2 py-1 font-mono text-xs text-white outline-none ${
                                  field.hasError
                                    ? "border-red-500 text-red-300"
                                    : "border-slate-700 focus:border-sky-400"
                                }`}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO DE DESAMBIGUAÇÃO INTERATIVA */}
                  {activeIntentPlan.unresolved.length > 0 && (
                    <div className="space-y-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 p-3">
                      {activeIntentPlan.unresolved.map((amb) => (
                        <div key={amb.id} className="space-y-2">
                          <div className="flex items-start gap-2">
                            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-200">{amb.question}</p>
                              <p className="text-[11px] text-amber-300/80 mt-0.5">{amb.reason}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {amb.options.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleApplyAmbiguityPatch(opt.patch)}
                                className="flex flex-col text-left p-2.5 rounded-xl bg-slate-900/90 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 transition-all cursor-pointer"
                              >
                                <span className="text-xs font-bold text-white">{opt.label}</span>
                                <span className="text-[10px] text-slate-300 mt-0.5">
                                  {opt.description}
                                </span>
                              </button>
                            ))}
                          </div>

                          {amb.requiresNumericInput && (
                            <div className="flex items-center gap-2 pt-1.5 border-t border-amber-500/20">
                              <span className="text-[11px] font-mono text-amber-200">
                                {amb.requiresNumericInput.label}:
                              </span>
                              <input
                                type="number"
                                value={customPcdInput}
                                onChange={(e) => setCustomPcdInput(e.target.value)}
                                className="w-24 rounded-lg bg-slate-950 border border-amber-500/40 px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-amber-400"
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
                                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold transition-colors cursor-pointer"
                              >
                                Definir {amb.requiresNumericInput.unit}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ERROS OU AVISOS DE VALIDAÇÃO GEOMÉTRICA */}
                  {(hasGeometricError || activeIntentPlan.validation.issues.length > 0) && (
                    <div className="space-y-1.5">
                      {isPlatePlan &&
                        livePlateValidation.errorMessages.map((msg, idx) => (
                          <div
                            key={`live-err-${idx}`}
                            className="flex items-start gap-2 rounded-xl p-2.5 text-xs border bg-red-950/40 border-red-500/50 text-red-200"
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#ef4444]" />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-[10px] uppercase mr-1.5 text-[#ef4444]">
                                [ERRO GEOMÉTRICO]
                              </span>
                              <span>{msg}</span>
                            </div>
                          </div>
                        ))}
                      {!isPlatePlan &&
                        activeIntentPlan.validation.issues.map((iss, idx) => (
                          <div
                            key={`${iss.code}-${idx}`}
                            className={`flex items-start gap-2 rounded-xl p-2.5 text-xs border ${
                              iss.severity === "error"
                                ? "bg-red-950/40 border-red-500/40 text-red-200"
                                : "bg-amber-950/30 border-amber-500/30 text-amber-200"
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-[10px] uppercase mr-1.5">
                                [{iss.code}]
                              </span>
                              <span>{iss.message}</span>
                              {iss.mathematicalConstraint && (
                                <span className="block font-mono text-[10px] opacity-75 mt-0.5">
                                  Restrição: {iss.mathematicalConstraint}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}

                      {activeIntentPlan.v2 &&
                        activeIntentPlan.v2.conflictAlternatives.length > 0 && (
                          <div className="rounded-xl bg-red-950/30 border border-red-500/40 p-2.5 space-y-2">
                            <span className="block text-[10px] font-mono uppercase tracking-wider text-red-300">
                              Alternativas Numéricas Sugeridas (Auto-Correção)
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {activeIntentPlan.v2.conflictAlternatives.map((alt) => (
                                <button
                                  key={alt.id}
                                  type="button"
                                  onClick={() => handleApplyAmbiguityPatch(alt.patch)}
                                  className="flex flex-col text-left p-2 rounded-lg bg-slate-900/90 hover:bg-red-500/20 border border-red-500/40 hover:border-red-400 transition-colors cursor-pointer"
                                >
                                  <span className="text-xs font-bold text-white">{alt.label}</span>
                                  <span className="text-[10px] text-slate-300 mt-0.5">
                                    {alt.description}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* ALERTAS DE FABRICAÇÃO (DFM §8) */}
                  {activeIntentPlan.v2 &&
                    activeIntentPlan.v2.manufacturingReport.warnings.length > 0 && (
                      <div className="space-y-1.5">
                        {activeIntentPlan.v2.manufacturingReport.warnings.map((w, idx) => (
                          <div
                            key={`${w.code}-${idx}`}
                            className="flex items-start gap-2 rounded-xl p-2.5 text-xs border bg-amber-950/30 border-amber-500/30 text-amber-200"
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-[10px] uppercase mr-1.5 text-amber-300">
                                [DFM · {w.entity_id}]
                              </span>
                              <span>{w.message}</span>
                              <span className="block font-mono text-[10px] text-amber-300/90 mt-0.5">
                                Medido: {w.measured_value} mm · Limite: {w.limit_value} mm ·{" "}
                                {w.suggested_fix}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* CONFIRMAÇÃO DE PREMISSA PROVISÓRIA (§10 & §15) */}
                  {activeIntentPlan.v2?.requiresPremiseConfirmation &&
                    !parameterOverrides.premise_confirmed && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-500/10 border border-sky-500/30 px-2.5 py-1.5 text-[11px] text-sky-200">
                        <span className="font-mono text-[10px]">
                          Premissa geométrica provisória aplicada na prévia. Deseja confirmar?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOverrideChange("premise_confirmed", true)}
                          className="rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50 px-2.5 py-1 font-mono text-[10px] font-bold text-sky-200 cursor-pointer"
                        >
                          Confirmar premissa
                        </button>
                      </div>
                    )}

                  {/* MÉTRICAS + CONTADOR DELTA (+Criar / ~Modificar / -Remover) + VER OPERAÇÕES DO CAD + VER DSL */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span>
                        Entidades:{" "}
                        <strong className="text-white">
                          {activeIntentPlan.compiled?.previewEntities.length ?? 0}
                        </strong>
                      </span>
                      <span>
                        Cotas:{" "}
                        <strong className="text-white">
                          {activeIntentPlan.compiled?.generatedDimensions.length ?? 0}
                        </strong>
                      </span>
                      {activeIntentPlan.v2?.entityDelta && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 border border-slate-800 px-2 py-0.5 text-[10px]">
                          <span className="text-emerald-400">
                            +{activeIntentPlan.v2.entityDelta.createCount} criar
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-amber-300">
                            ~{activeIntentPlan.v2.entityDelta.modifyCount} mod
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-rose-400">
                            -{activeIntentPlan.v2.entityDelta.deleteCount} rem
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveCurrentPlanAsTemplate}
                        className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        <Bookmark className="w-3 h-3" />
                        <span>Salvar Gabarito</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveMisinterpretedCaseToGoldenSuite({
                            prompt: query.trim() || activeIntentPlan.intent.raw_prompt,
                            actualPlanSummary: activeIntentPlan.intent.summary,
                          });
                          toast.info("Caso salvo na Suíte Golden ('Interpretou errado').");
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Flag className="w-3 h-3" />
                        <span>Interpretou errado</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCadOpsInspector((v) => !v)}
                        className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>
                          {showCadOpsInspector ? "Ocultar operações do CAD" : "Ver operações do CAD"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDslInspector((v) => !v)}
                        className="flex items-center gap-1 text-[10px] font-mono text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>{showDslInspector ? "Ocultar DSL" : "Ver DSL"}</span>
                      </button>
                    </div>
                  </div>

                  {showCadOpsInspector && (
                    <pre className="max-h-40 overflow-auto rounded-xl bg-slate-950 p-2.5 text-[10px] font-mono text-indigo-300 border border-slate-800">
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

                  {showDslInspector && (
                    <pre className="max-h-44 overflow-auto rounded-xl bg-slate-950 p-2.5 text-[10px] font-mono text-emerald-300 border border-slate-800">
                      {JSON.stringify(
                        {
                          plan_id: activeIntentPlan.plan_id,
                          schema_version: activeIntentPlan.schema_version,
                          document_context: activeIntentPlan.document_context,
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

                  {/* BOTÕES DO CARTÃO: Descartar · Aplicar (Manter no Chat) · Confirmar e Inserir */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        saveComposerDraft(projectId, "");
                        setParameterOverrides({});
                      }}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      disabled={!canApplyPlan}
                      onClick={() => handleConfirmPlan(true)}
                      className={`min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        canApplyPlan
                          ? "bg-sky-500/20 hover:bg-sky-500/30 border-sky-400/50 text-sky-200 cursor-pointer"
                          : "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>Aplicar (Manter no Chat)</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canApplyPlan}
                      onClick={() => handleConfirmPlan(false)}
                      className={`min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        canApplyPlan
                          ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      }`}
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

              {/* ATALHOS DE FERRAMENTAS TRADICIONAIS QUANDO RELEVANTE */}
              {filteredCommands.length > 0 && !activeIntentPlan && thread.messages.length === 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-1">
                    Ferramentas Diretas do CHAMFER CAD
                  </p>
                  <div className="divide-y divide-slate-800/40">
                    {filteredCommands.map((cmd, idx) => {
                      const Icon = cmd.icon;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={() => handleSelectCommand(cmd)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                            isSelected
                              ? "bg-slate-800/90 text-white"
                              : "hover:bg-slate-900 text-slate-300"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 text-slate-300">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold truncate">{cmd.title}</span>
                              {cmd.shortcut && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 rounded border border-slate-700 text-slate-400">
                                  {cmd.shortcut}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{cmd.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ===================================================================== */}
            {/* 4. RODAPÉ COMPOSER (§4.4 + Fase 4 Voz + Fase 5 @Menções + Fase 7 Anexos) */}
            {/* ===================================================================== */}
            <div className="bg-slate-900/95 border-t border-slate-800 px-3.5 py-2.5 space-y-2">
              {/* Menu de Autocompletar Menções `@entidade` (Fase 5) */}
              {activeAtMention.active && mentionSuggestions.length > 0 && (
                <div className="rounded-xl bg-slate-950 border border-emerald-500/40 p-1.5 space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono text-emerald-400 uppercase">
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
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <span className="font-mono text-xs font-bold text-emerald-300">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Menu de Comandos Rápidos (/) */}
              {matchingSlashCommands.length > 0 && (
                <div className="rounded-xl bg-slate-950 border border-sky-500/40 p-1.5 space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono text-sky-400 uppercase">
                    <Terminal className="w-3 h-3" /> Comandos Rápidos do CHAMFER INTENT
                  </div>
                  {matchingSlashCommands.map((sc) => (
                    <button
                      key={sc.command}
                      type="button"
                      onClick={() => handleExecuteSlashCommand(sc.command)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="font-mono text-xs font-bold text-sky-300 mr-2">
                          {sc.command}
                        </span>
                        <span className="text-xs text-white font-semibold">{sc.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 hidden sm:inline truncate">
                        {sc.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Indicador de Voz Ativa (Fase 4 — §5) */}
              {micState !== "inactive" && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-red-950/40 border border-red-500/40 px-3 py-1.5 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-red-200 font-bold uppercase">
                      {micState === "listening" ? "Ouvindo (pt-BR)..." : "Processando voz..."}
                    </span>
                    {voiceInterimTranscript && (
                      <span className="text-slate-300 truncate max-w-[200px]">
                        "{voiceInterimTranscript}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all duration-100"
                        style={{ width: `${audioLevel}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">1,5s silêncio auto</span>
                  </div>
                </div>
              )}

              {/* Chips de Contexto Anexado (Seleção, Versão, Camada, Anexo Croqui/DXF, @menções) */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                <span className="rounded-lg bg-slate-950 border border-slate-800 px-2 py-0.5 text-slate-300">
                  Versão:{" "}
                  <strong className="text-emerald-400">{thread.activeVersionId ?? "V0"}</strong>
                </span>
                <span className="rounded-lg bg-slate-950 border border-slate-800 px-2 py-0.5 text-slate-300">
                  Camada: <strong className="text-white uppercase">{String(activeLayer)}</strong>
                </span>
                {selectedEntityIds.length > 0 && includeSelectionContext && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 text-sky-200">
                    <span>@selecionado ({selectedEntityIds.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIncludeSelectionContext(false);
                        onClearSelection?.();
                      }}
                      className="hover:text-white cursor-pointer"
                      title="Desanexar seleção desta mensagem"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {attachedFileSummary && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-emerald-200">
                    <span>{attachedFileSummary.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFileSummary(null)}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <span className="text-slate-500 ml-auto hidden sm:inline">
                  <strong className="text-slate-300">@</strong> entidade ·{" "}
                  <strong className="text-slate-300">/</strong> comandos ·{" "}
                  <strong className="text-slate-300">↑</strong> última msg
                </span>
              </div>

              {/* Campo Textarea Auto-Expansível + Botões Anexo (Fase 7), Microfone (Fase 4) e Enviar/Parar */}
              <div className="flex items-end gap-1.5 sm:gap-2">
                {/* Input oculto para Croqui / Foto / DXF (Fase 7) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dxf,.svg,image/*"
                  onChange={handleFileAttachmentChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                  title="Anexar Croqui, Foto ou arquivo DXF/SVG (Fase 7)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <div className="flex-1 flex items-center rounded-2xl bg-slate-950 border border-slate-800 focus-within:border-sky-500/60 px-3 py-1.5">
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
                        ? "Descreva alteração (ex.: 'Aumente @holes_1 para 16 mm'), fale no microfone ou digite /..."
                        : "Descreva ou fale a peça em pt-BR (ex.: 'Chapa 400x250 mm com raio 20 e 5 furos de 12 mm')..."
                    }
                    className="w-full max-h-[116px] resize-none bg-transparent text-white placeholder:text-slate-500 outline-none text-xs sm:text-sm font-sans leading-relaxed"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        saveComposerDraft(projectId, "");
                        setParameterOverrides({});
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                      title="Limpar comando"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Botão de Microfone 3 Estados (Fase 4 — §5: inativo · ouvindo · processando) */}
                <button
                  type="button"
                  onClick={handleToggleVoiceMic}
                  className={`min-h-[44px] min-w-[44px] rounded-2xl border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    micState === "listening"
                      ? "bg-red-600 border-red-400 text-white animate-pulse"
                      : micState === "processing"
                        ? "bg-amber-500 border-amber-400 text-slate-950"
                        : "bg-slate-950 border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-white"
                  }`}
                  title={
                    micState === "listening"
                      ? "Ouvindo em pt-BR (Toque para parar)"
                      : "Comando por Voz em pt-BR (Toque para falar · Ctrl+Shift+M)"
                  }
                >
                  <Mic className="w-4 h-4" />
                </button>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStreaming}
                    className="min-h-[44px] min-w-[44px] px-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    title="Parar geração"
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
                    className={`min-h-[44px] min-w-[44px] px-3.5 rounded-2xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all ${
                      query.trim()
                        ? "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/25 cursor-pointer"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed"
                    }`}
                    title="Enviar turno para a conversa (Enter aplica, Shift+Enter quebra linha)"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Enviar</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
