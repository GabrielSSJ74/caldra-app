import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  GraduationCap,
  BookOpen,
  Binary,
  TableProperties,
  Library,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ArrowRight,
  Compass,
  Play,
  Clock,
  Sparkles,
  Search,
  CheckCircle2,
  Award,
  Zap,
  Copy,
  Check,
  Star,
  Lock,
  Calculator,
  Lightbulb,
  X,
  Layers,
  Wrench,
} from "lucide-react";
import {
  useAcademy,
  nextLesson,
  setMastery,
  markOpened,
  toggleFavorite,
  recordExercise,
} from "@/lib/education/progress";
import { CURRICULUM, ALL_LESSONS } from "@/lib/education/curriculum";
import {
  ACADEMY_TRACKS,
  INTERACTIVE_FORMULAS,
  SHOP_FLOOR_TABLES,
  EXTENDED_CATALOG_ITEMS,
  GLOSSARY_ITEMS,
  computeTrackProgress,
  computeDomainProficiencies,
  getEnrichedLessonContent,
  searchAcademyContent,
  calcSheetWeight,
  type FormulaGroupCategory,
  type CatalogFilterCategory,
  type InteractiveFormulaSpec,
  type NormativeTableRow,
  type NormativeTableSpec,
  type ExtendedCatalogItem,
} from "@/lib/education/academyEngine";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveEffectiveThemeId } from "@/lib/settings/themeTransitionEngine";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { NavigationAreaHeader } from "@/components/ui/NavigationAreaHeader";
import { NavigationAreaContainer } from "@/components/layout/NavigationAreaContainer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aprenda")({
  head: () => ({
    meta: [
      { title: "Aprenda & Domine — CALDRA Academia" },
      {
        name: "description",
        content:
          "Academia técnica de engenharia industrial: formação em estruturas metálicas, caldeiraria, traçagem geométrica, tabelas NBR e formulário interativo.",
      },
      { property: "og:title", content: "Aprenda & Domine — CALDRA Academia" },
      {
        property: "og:description",
        content:
          "Estudos, trilhas de engenharia, tabelas normativas NBR 11888, glossário de oficina e simuladores matemáticos.",
      },
    ],
  }),
  component: AprendaPage,
});

type MainAcademyTab = "estudo" | "trilhas" | "biblioteca" | "formulas";
type LibrarySubTab = "tabelas" | "catalogo" | "glossario";

const FAVORITE_CATALOG_STORAGE_KEY = "caldra.academy.catalog_favs.v1";

function readCatalogFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITE_CATALOG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function AprendaPage() {
  const navigate = useNavigate();
  const academyState = useAcademy();
  const next = nextLesson(academyState);
  const { can } = useFeatureAccess();
  const isProUser = can("school.full");

  const { theme } = useSettings();
  const effectiveTheme = resolveEffectiveThemeId(theme);
  const isLight = effectiveTheme === "light";
  const isAmoled = effectiveTheme === "amoled";

  // Tokens semânticos de alto contraste (WCAG AA >= 4,5:1) para os 4 temas
  const titleTextClass = isLight ? "text-[#0F172A] font-extrabold" : "text-[#F8FAFC] font-extrabold";
  const subtitleTextClass = isLight ? "text-[#475569]" : "text-[#94A3B8]";
  const auxTextClass = "text-[#64748B]";

  const cardSurfaceStyle: React.CSSProperties = isLight
    ? {
        background: "rgba(255, 255, 255, 0.88)",
        border: "1px solid rgba(15, 23, 42, 0.10)",
        boxShadow: "0 6px 20px rgba(15, 23, 42, 0.05)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }
    : isAmoled
      ? {
          background: "#05080F",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        }
      : {
          background: "rgba(15, 23, 42, 0.62)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "0 8px 24px rgba(2, 6, 23, 0.28)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        };

  const subtleBoxClass = isLight
    ? "bg-slate-900/[0.04] border border-slate-900/[0.08]"
    : isAmoled
      ? "bg-white/[0.03] border border-white/[0.10]"
      : "bg-slate-950/50 border border-white/[0.08]";

  // Navegação de 4 Abas + Busca Universal
  const [activeTab, setActiveTab] = useState<MainAcademyTab>("estudo");
  const [universalSearchOpen, setUniversalSearchOpen] = useState(false);
  const [rawSearchQuery, setRawSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(rawSearchQuery), 150);
    return () => window.clearTimeout(t);
  }, [rawSearchQuery]);

  // Estado da Aba 2 (Trilhas)
  const [expandedTrackId, setExpandedTrackId] = useState<string>("trilha-fundamentos");
  const [showFullCurriculum, setShowFullCurriculum] = useState(false);

  // Estado da Aba 3 (Biblioteca)
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>("tabelas");
  const [activeTableId, setActiveTableId] = useState<string>("bitolas-chapa");
  const [catalogCategory, setCatalogCategory] = useState<CatalogFilterCategory>("Todos");
  const [catalogFavs, setCatalogFavs] = useState<string[]>(() => readCatalogFavorites());
  const [selectedTableRowSheet, setSelectedTableRowSheet] = useState<{
    table: NormativeTableSpec;
    row: NormativeTableRow;
  } | null>(null);
  const [sheetCalcWidth, setSheetCalcWidth] = useState<number>(1000);
  const [sheetCalcLength, setSheetCalcLength] = useState<number>(2000);
  const [selectedCatalogItemSheet, setSelectedCatalogItemSheet] =
    useState<ExtendedCatalogItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estado da Aba 4 (Fórmulas e Mini-Simuladores)
  const [formulaGroup, setFormulaGroup] = useState<FormulaGroupCategory>("Todas");
  const [expandedSimulators, setExpandedSimulators] = useState<Record<string, boolean>>({
    "circunferencia-neutra": true,
  });
  const [formulaInputs, setFormulaInputs] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    for (const f of INTERACTIVE_FORMULAS) {
      initial[f.id] = { ...f.defaultInputs };
    }
    return initial;
  });

  // Estado do Leitor de Aula Imersivo
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [selectedCheckpointOption, setSelectedCheckpointOption] = useState<number | null>(null);

  const toggleCatalogFav = (id: string) => {
    triggerHaptic("selection");
    setCatalogFavs((prev) => {
      const nextFavs = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(FAVORITE_CATALOG_STORAGE_KEY, JSON.stringify(nextFavs));
      } catch {
        /* ignore */
      }
      return nextFavs;
    });
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    triggerHaptic("tap");
    AudioManager.play("ui_pop");
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const openImmersiveLesson = (lessonId: string) => {
    triggerHaptic("selection");
    AudioManager.play("ui_pop");
    markOpened(lessonId);
    setSelectedCheckpointOption(null);
    setActiveLessonId(lessonId);
    setUniversalSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Estatísticas reais de progresso (41 lições)
  const totalLessonsCount = useMemo(
    () => CURRICULUM.reduce((acc, m) => acc + m.lessons.length, 0),
    [],
  );

  const totalCompleted = useMemo(() => {
    return Object.values(academyState.lessons).filter(
      (l) => l.mastery === "dominado" || l.mastery === "praticado",
    ).length;
  }, [academyState.lessons]);

  const progressPct = Math.min(
    100,
    Math.round((totalCompleted / Math.max(1, totalLessonsCount)) * 100),
  );

  const domainProficiencies = useMemo(
    () => computeDomainProficiencies(academyState),
    [academyState],
  );

  const currentHeroLesson = useMemo(() => {
    if (next) return next;
    return ALL_LESSONS[0]!;
  }, [next]);

  // Favoritos e histórico recente do aluno
  const recentOrFavoriteLessons = useMemo(() => {
    const items = ALL_LESSONS.filter(({ lesson }) => {
      const st = academyState.lessons[lesson.id];
      return st && (st.favorite || st.lastAt > 0);
    }).sort(
      (a, b) =>
        (academyState.lessons[b.lesson.id]?.lastAt ?? 0) -
        (academyState.lessons[a.lesson.id]?.lastAt ?? 0),
    );
    return items.length > 0 ? items.slice(0, 4) : ALL_LESSONS.slice(0, 3);
  }, [academyState.lessons]);

  // Busca Universal
  const searchResults = useMemo(
    () => searchAcademyContent(debouncedQuery),
    [debouncedQuery],
  );

  // Filtro de Fórmulas
  const visibleFormulas = useMemo(() => {
    if (formulaGroup === "Todas") return INTERACTIVE_FORMULAS;
    return INTERACTIVE_FORMULAS.filter((f) => f.category === formulaGroup);
  }, [formulaGroup]);

  // Filtro de Catálogo
  const visibleCatalogItems = useMemo(() => {
    if (catalogCategory === "Todos") return EXTENDED_CATALOG_ITEMS;
    return EXTENDED_CATALOG_ITEMS.filter((item) => item.category === catalogCategory);
  }, [catalogCategory]);

  const activeLessonData = useMemo(
    () => (activeLessonId ? getEnrichedLessonContent(activeLessonId) : null),
    [activeLessonId],
  );

  /* =========================================================================
     RENDERIZAÇÃO DO LEITOR DE AULA IMERSIVO (QUANDO UMA AULA ESTÁ ABERTA)
     ========================================================================= */
  if (activeLessonData) {
    const { lesson, module, track, lessonIndexInModule, globalIndex, totalLessons } =
      activeLessonData;
    const lessonLocked = !lesson.free && !isProUser;
    const st = academyState.lessons[lesson.id];
    const isCompleted = st?.mastery === "dominado" || st?.mastery === "praticado";
    const isFav = !!st?.favorite;
    const prevLesson = globalIndex > 0 ? ALL_LESSONS[globalIndex - 1] : null;
    const nextLessonItem =
      globalIndex < totalLessons - 1 ? ALL_LESSONS[globalIndex + 1] : null;

    return (
      <div className="w-full min-h-screen bg-transparent text-foreground overflow-x-hidden">
        <NavigationAreaContainer
          className="space-y-4"
          style={{ paddingBottom: "calc(140px + env(safe-area-inset-bottom, 16px))" } as never}
        >
          {/* Barra Superior Fixa do Leitor Imersivo */}
          <div
            style={cardSurfaceStyle}
            className="sticky top-14 z-30 rounded-2xl p-3 sm:p-3.5 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  setActiveLessonId(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer",
                  subtleBoxClass,
                  titleTextClass,
                )}
              >
                <ChevronLeft className="size-3.5 text-amber-500" />
                <span>Voltar</span>
              </button>

              <div className="min-w-0 flex-1 text-center px-2">
                <p className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-500 truncate">
                  {track.number} • MÓDULO {module.code}
                </p>
                <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                  Aula {lessonIndexInModule} de {module.lessons.length} ({globalIndex + 1}/
                  {totalLessons})
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  toggleFavorite(lesson.id);
                }}
                aria-label="Favoritar aula"
                className={cn(
                  "grid size-8 place-items-center rounded-xl transition-colors cursor-pointer",
                  subtleBoxClass,
                )}
              >
                <Star
                  className={cn(
                    "size-4",
                    isFav ? "fill-amber-400 text-amber-400" : subtitleTextClass,
                  )}
                />
              </button>
            </div>

            {/* Barra de progresso da trilha/currículo */}
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-slate-500/15">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.round(((globalIndex + 1) / totalLessons) * 100)}%` }}
              />
            </div>
          </div>

          {lessonLocked ? (
            <div style={cardSurfaceStyle} className="rounded-2xl p-6 text-center space-y-3">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
                <Lock className="size-5" />
              </div>
              <h2 className={cn("font-display text-lg", titleTextClass)}>
                Aula Exclusiva CALDRA PRO
              </h2>
              <p className={cn("mx-auto max-w-md text-xs leading-relaxed", subtitleTextClass)}>
                O conteúdo prático completo, o diagrama técnico comentando as cotas de oficina e o
                checkpoint desta lição fazem parte do pacote CALDRA PRO.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <Link
                  to="/pro"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  <span>Desbloquear CALDRA PRO</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho e Conceito Fundamental */}
              <article style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-500 uppercase">
                    MÓDULO {module.code} • {module.title}
                  </span>
                  <span className={cn("font-mono text-[10px] flex items-center gap-1", subtitleTextClass)}>
                    <Clock className="size-3 text-amber-500" />
                    {lesson.minutes} min de leitura
                  </span>
                  {isCompleted && (
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Concluída
                    </span>
                  )}
                </div>

                <h1 className={cn("font-display text-xl sm:text-2xl leading-tight", titleTextClass)}>
                  {lesson.title}
                </h1>

                <div className="space-y-2.5 text-[15px] leading-[1.6]">
                  <p className={cn("font-semibold", isLight ? "text-slate-800" : "text-slate-100")}>
                    {activeLessonData.concept}
                  </p>
                  <p className={subtitleTextClass}>{activeLessonData.definition}</p>
                </div>

                {/* Diagrama Técnico Vetorial SVG (currentColor) */}
                <div className={cn("rounded-xl p-4", subtleBoxClass)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-sky-500">
                      Esquema Técnico Vetorial de Oficina
                    </span>
                    <span className={cn("font-mono text-[9.5px]", auxTextClass)}>
                      Geometria 1:1
                    </span>
                  </div>
                  <div className="mx-auto max-w-sm">
                    <TechnicalConceptSvg
                      diagram={activeLessonData.diagramType}
                      isLight={isLight}
                    />
                  </div>
                </div>

                {/* Fórmulas Relacionadas */}
                {activeLessonData.relatedFormulaExpressions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className={cn("font-mono text-[11px] uppercase tracking-wider", titleTextClass)}>
                      Relações Matemáticas da Aula
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {activeLessonData.relatedFormulaExpressions.map((f, idx) => (
                        <div key={idx} className={cn("rounded-xl p-3", subtleBoxClass)}>
                          <p className="font-mono text-sm font-bold text-amber-500">{f.expr}</p>
                          <p className={cn("text-xs mt-1", subtitleTextClass)}>{f.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passo a Passo Numerado de Chão de Fábrica */}
                <div className="space-y-2">
                  <h3 className={cn("font-mono text-[11px] uppercase tracking-wider", titleTextClass)}>
                    Passo a Passo de Chão de Fábrica
                  </h3>
                  <ol className="space-y-2">
                    {activeLessonData.steps.map((step, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl p-3 text-xs sm:text-[13px] leading-relaxed",
                          subtleBoxClass,
                        )}
                      >
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-500">
                          {i + 1}
                        </span>
                        <span className={isLight ? "text-slate-700" : "text-slate-200"}>
                          {step.replace(/^\d+\.\s*/, "")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Caixa de Destaque: 💡 Dica de Mestre Caldeireiro */}
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-500">
                    <Lightbulb className="size-3.5 shrink-0" />
                    <span>Dica de Mestre Caldeireiro</span>
                  </div>
                  <p className={cn("text-xs sm:text-[13px] leading-relaxed", isLight ? "text-slate-800" : "text-slate-200")}>
                    {activeLessonData.masterTip}
                  </p>
                </div>

                {/* Exemplo Numérico Resolvido */}
                <div className={cn("rounded-xl p-3.5 space-y-1", subtleBoxClass)}>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">
                    Exemplo Numérico Resolvido
                  </span>
                  <p className={cn("font-mono text-xs leading-relaxed", isLight ? "text-slate-800" : "text-slate-200")}>
                    {activeLessonData.solvedExample}
                  </p>
                </div>
              </article>

              {/* Checkpoint Rápido de Fixação */}
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-amber-500" />
                  <h3 className={cn("font-display text-sm sm:text-base", titleTextClass)}>
                    Checkpoint Rápido de Domínio
                  </h3>
                </div>
                <p className={cn("text-xs sm:text-[13px] leading-relaxed", subtitleTextClass)}>
                  {activeLessonData.checkpoint.question}
                </p>
                <div className="space-y-2">
                  {activeLessonData.checkpoint.options.map((opt, idx) => {
                    const isSelected = selectedCheckpointOption === idx;
                    const isCorrect = idx === activeLessonData.checkpoint.correctIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setSelectedCheckpointOption(idx);
                          recordExercise(lesson.id, isCorrect);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left font-mono text-xs transition-all cursor-pointer",
                          isSelected
                            ? isCorrect
                              ? "border border-emerald-500 bg-emerald-500/15 text-emerald-500 font-bold"
                              : "border border-rose-500 bg-rose-500/15 text-rose-500 font-bold"
                            : cn(subtleBoxClass, isLight ? "text-slate-800" : "text-slate-200"),
                        )}
                      >
                        <span>{opt}</span>
                        {isSelected && (
                          <span>{isCorrect ? "✓ Correto" : "✕ Revise"}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedCheckpointOption !== null && (
                  <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-500 font-medium">
                    {activeLessonData.checkpoint.explanation}
                  </p>
                )}
              </section>

              {/* Barra de Ação no Rodapé do Leitor (Acima da Área Segura da Dock) */}
              <div style={cardSurfaceStyle} className="rounded-2xl p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("success");
                    AudioManager.play("ui_pop");
                    setMastery(lesson.id, isCompleted ? "em-estudo" : "dominado");
                  }}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-mono text-xs font-bold uppercase transition-all cursor-pointer",
                    isCompleted
                      ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/40"
                      : "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400",
                  )}
                >
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {isCompleted
                      ? "Lição Concluída — Desfazer"
                      : "Concluir Lição (+Progresso)"}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!prevLesson}
                    onClick={() => prevLesson && openImmersiveLesson(prevLesson.lesson.id)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-mono text-[11px] font-bold uppercase transition-opacity cursor-pointer disabled:opacity-35",
                      subtleBoxClass,
                      titleTextClass,
                    )}
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>Aula Anterior</span>
                  </button>

                  <button
                    type="button"
                    disabled={!nextLessonItem}
                    onClick={() => nextLessonItem && openImmersiveLesson(nextLessonItem.lesson.id)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-mono text-[11px] font-bold uppercase transition-opacity cursor-pointer disabled:opacity-35",
                      subtleBoxClass,
                      titleTextClass,
                    )}
                  >
                    <span>Próxima Aula</span>
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>

                {/* Ponte Prática 1:1 */}
                <Link
                  to={activeLessonData.practiceRoute}
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_nav");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/12 px-4 py-2.5 font-mono text-xs font-bold uppercase text-sky-500 hover:bg-sky-500/20 transition-colors cursor-pointer"
                >
                  <Zap className="size-3.5 shrink-0" />
                  <span>{activeLessonData.practiceLabel}</span>
                </Link>
              </div>
            </>
          )}
        </NavigationAreaContainer>
      </div>
    );
  }

  /* =========================================================================
     RENDERIZAÇÃO PRINCIPAL DA SEÇÃO "APRENDA & DOMINE" (CALDRA ACADEMIA 3.0)
     ========================================================================= */
  return (
    <div className="w-full min-h-screen bg-transparent text-foreground overflow-x-hidden">
      <NavigationAreaContainer
        className="space-y-4"
        style={{ paddingBottom: "calc(135px + env(safe-area-inset-bottom, 16px))" } as never}
      >
        {/* 1. IDENTIDADE INSTITUCIONAL NO TOPO */}
        <NavigationAreaHeader
          badgeText="CALDRA ACADEMIA • FORMAÇÃO TÉCNICA EM ESTRUTURAS METÁLICAS, CALDEIRARIA E FABRICAÇÃO"
          badgeColor="text-amber-500"
          indicatorColor="bg-amber-500"
          secondaryBadge={
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[8px] font-bold text-amber-500 border border-amber-500/35">
              PRO CALDRA
            </span>
          }
          title="Aprenda & Domine"
        />

        {/* 2. BARRA SEGMENTADA DE 4 ABAS COMPACTAS + BUSCA UNIVERSAL (🔍) — ZERO OVERFLOW EM 320px */}
        <div
          style={cardSurfaceStyle}
          className="rounded-2xl p-1.5"
        >
          <div
            role="tablist"
            aria-label="Navegação da Academia CALDRA"
            className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-1"
          >
            {(
              [
                { id: "estudo", label: "Estudo", icon: GraduationCap },
                { id: "trilhas", label: "Trilhas", icon: Compass },
                { id: "biblioteca", label: "Biblioteca", icon: BookOpen },
                { id: "formulas", label: "Fórmulas", icon: Binary },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id && !universalSearchOpen;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_pop");
                    setUniversalSearchOpen(false);
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl py-2 px-1 sm:px-2.5 text-[10.5px] sm:text-xs font-bold tracking-tight transition-all cursor-pointer min-w-0",
                    isActive
                      ? "bg-amber-500 text-slate-950 shadow-sm"
                      : cn(
                          subtitleTextClass,
                          isLight ? "hover:bg-slate-900/[0.05]" : "hover:bg-white/[0.06]",
                        ),
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}

            {/* Botão de Busca Universal (🔍) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_pop");
                setUniversalSearchOpen((o) => !o);
              }}
              aria-label="Busca Universal na Academia"
              aria-pressed={universalSearchOpen}
              title="Pesquisar aulas, fórmulas, tabelas NBR e glossário"
              className={cn(
                "grid size-9 place-items-center rounded-xl transition-all cursor-pointer shrink-0",
                universalSearchOpen
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : cn(
                      subtleBoxClass,
                      isLight ? "text-slate-700" : "text-slate-200",
                    ),
              )}
            >
              <Search className="size-4" />
            </button>
          </div>

          {/* Barra de Busca Universal Expansível */}
          {universalSearchOpen && (
            <div className="mt-2 pt-2 border-t border-slate-500/15 space-y-3 px-1 pb-1">
              <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2", subtleBoxClass)}>
                <Search className="size-4 shrink-0 text-amber-500" />
                <input
                  type="text"
                  value={rawSearchQuery}
                  onChange={(e) => setRawSearchQuery(e.target.value)}
                  placeholder="Buscar em 41 lições, fórmulas, MSG 14, NBR 11888, Tubo 4, Fator K..."
                  autoFocus
                  className={cn(
                    "w-full bg-transparent text-xs sm:text-[13px] outline-none",
                    isLight
                      ? "text-slate-900 placeholder:text-slate-400"
                      : "text-slate-100 placeholder:text-slate-500",
                  )}
                />
                {rawSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setRawSearchQuery("")}
                    aria-label="Limpar busca"
                    className={cn("p-0.5 rounded cursor-pointer", subtitleTextClass)}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {debouncedQuery.trim() !== "" && (
                <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                  {searchResults.totalCount === 0 ? (
                    <p className={cn("py-4 text-center text-xs", subtitleTextClass)}>
                      Nenhum resultado encontrado para "{debouncedQuery}".
                    </p>
                  ) : (
                    <>
                      {searchResults.lessons.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                            Aulas ({searchResults.lessons.length})
                          </p>
                          {searchResults.lessons.slice(0, 6).map(({ lesson, module }) => (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => openImmersiveLesson(lesson.id)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer",
                                subtleBoxClass,
                              )}
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {lesson.title}
                                </p>
                                <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                                  Módulo {module.code} • {module.title} • {lesson.minutes} min
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-amber-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.formulas.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-500">
                            Fórmulas ({searchResults.formulas.length})
                          </p>
                          {searchResults.formulas.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setUniversalSearchOpen(false);
                                setActiveTab("formulas");
                                setFormulaGroup("Todas");
                                setExpandedSimulators((prev) => ({ ...prev, [f.id]: true }));
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer",
                                subtleBoxClass,
                              )}
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {f.code} — {f.name}
                                </p>
                                <p className="font-mono text-[10.5px] text-rose-500 truncate">
                                  {f.formula}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-rose-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.tablesAndCatalog.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-sky-500">
                            Tabelas & Catálogo ({searchResults.tablesAndCatalog.length})
                          </p>
                          {searchResults.tablesAndCatalog.slice(0, 6).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setUniversalSearchOpen(false);
                                setActiveTab("biblioteca");
                                if (item.kind === "table" && item.tableId) {
                                  setLibrarySubTab("tabelas");
                                  setActiveTableId(item.tableId);
                                  const tbl = SHOP_FLOOR_TABLES.find((t) => t.id === item.tableId);
                                  const row = tbl?.data[item.rowIndex ?? 0];
                                  if (tbl && row) setSelectedTableRowSheet({ table: tbl, row });
                                } else if (item.catalogItem) {
                                  setLibrarySubTab("catalogo");
                                  setSelectedCatalogItemSheet(item.catalogItem);
                                }
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer",
                                subtleBoxClass,
                              )}
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {item.title}
                                </p>
                                <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                                  {item.subtitle}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-sky-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.glossary.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                            Glossário ({searchResults.glossary.length})
                          </p>
                          {searchResults.glossary.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setUniversalSearchOpen(false);
                                setActiveTab("biblioteca");
                                setLibrarySubTab("glossario");
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer",
                                subtleBoxClass,
                              )}
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {g.term}
                                </p>
                                <p className={cn("text-[11px] truncate", subtitleTextClass)}>
                                  {g.summary}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-emerald-500" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* =====================================================================
            ABA 1: 🎓 ESTUDO (PAINEL DE EVOLUÇÃO, EM ESTUDO AGORA E HISTÓRICO)
            ===================================================================== */}
        {activeTab === "estudo" && (
          <div className="space-y-4">
            {/* 1.1 Passaporte de Evolução Técnica */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-500/15">
                <div className="flex items-center gap-3.5">
                  {/* Anel Circular de Progresso Geral */}
                  <div className="relative size-14 shrink-0 flex items-center justify-center">
                    <svg className="size-14 -rotate-90" viewBox="0 0 44 44">
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        stroke={isLight ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.1)"}
                        strokeWidth="4"
                      />
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        className="stroke-amber-500 transition-all duration-500"
                        strokeWidth="4"
                        strokeDasharray="113.1"
                        strokeDashoffset={113.1 - (progressPct / 100) * 113.1}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute font-mono text-xs font-extrabold text-amber-500">
                      {progressPct}%
                    </span>
                  </div>

                  <div>
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-500 block">
                      Passaporte de Domínio Industrial
                    </span>
                    <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                      {totalCompleted} de {totalLessonsCount} lições concluídas
                    </h2>
                    <p className={cn("text-xs", subtitleTextClass)}>
                      Nível: Traçador & Projetista Industrial
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("trilhas");
                  }}
                  className={cn(
                    "self-start sm:self-center inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase transition-colors cursor-pointer",
                    subtleBoxClass,
                    titleTextClass,
                  )}
                >
                  <span>Explorar 5 Trilhas</span>
                  <ChevronRight className="size-3.5 text-amber-500" />
                </button>
              </div>

              {/* 3 Barras de Proficiência por Domínio */}
              <div className="grid gap-3 sm:grid-cols-3">
                {domainProficiencies.map((dom) => (
                  <div key={dom.id} className={cn("rounded-xl p-3 space-y-1.5", subtleBoxClass)}>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "font-display text-[11.5px] font-bold leading-snug",
                          isLight ? "text-slate-800" : "text-slate-200",
                        )}
                      >
                        {dom.label}
                      </span>
                      <span className="font-mono text-[10.5px] font-bold text-amber-500 shrink-0">
                        {dom.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${dom.pct}%` }}
                      />
                    </div>
                    <p className={cn("font-mono text-[9.5px]", auxTextClass)}>
                      {dom.done} de {dom.total} aulas dominadas
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* 1.2 Card Protagonista "Em Estudo Agora" (Continue de Onde Parou — Sem Grade de Fundo!) */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  <Sparkles className="size-3" />
                  EM ANDAMENTO • TRILHA MASTER
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 font-mono text-[10px] font-bold",
                    subtleBoxClass,
                    subtitleTextClass,
                  )}
                >
                  MÓDULO {currentHeroLesson.module.code}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-500">
                  <CheckCircle2 className="size-3" />
                  {currentHeroLesson.lesson.free || isProUser ? "Acesso Completo" : "PRO"}
                </span>
                <span className={cn("font-mono text-[10.5px] flex items-center gap-1 ml-auto", subtitleTextClass)}>
                  <Clock className="size-3.5 text-amber-500" />
                  {currentHeroLesson.lesson.minutes} min de conteúdo
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-7 space-y-3">
                  <div>
                    <h2 className={cn("font-display text-xl sm:text-2xl leading-tight", titleTextClass)}>
                      {currentHeroLesson.lesson.title}
                    </h2>
                    <p className={cn("text-xs sm:text-sm mt-1.5 leading-relaxed", subtitleTextClass)}>
                      {currentHeroLesson.module.summary} Domine o raciocínio geométrico de bancada,
                      desconto de Linha Neutra e planificação em verdadeira grandeza.
                    </p>
                  </div>

                  {/* Pilares da Lição */}
                  <div className={cn("flex flex-wrap items-center gap-3 text-xs font-mono", subtitleTextClass)}>
                    <span className="inline-flex items-center gap-1.5">
                      <Compass className="size-3.5 text-sky-500" />
                      Prática de Traçagem
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Award className="size-3.5 text-emerald-500" />
                      Certificação Progressiva
                    </span>
                  </div>

                  {/* 2 Botões de Ação Claros e Desobstruídos */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openImmersiveLesson(currentHeroLesson.lesson.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm px-4 py-2.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="size-4 fill-slate-950 text-slate-950" />
                      <span>Continuar Lição Agora</span>
                    </button>

                    <Link
                      to="/tracagem"
                      onClick={() => {
                        triggerHaptic("tap");
                        AudioManager.play("ui_nav");
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-semibold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer",
                        subtleBoxClass,
                        titleTextClass,
                      )}
                    >
                      <Compass className="size-4 text-sky-500" />
                      <span>Praticar na Oficina / CAD</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("tap");
                        setActiveTab("trilhas");
                        setShowFullCurriculum(true);
                      }}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-amber-500 hover:underline cursor-pointer px-1 py-1"
                    >
                      <span>Ver Currículo Completo →</span>
                    </button>
                  </div>
                </div>

                {/* Diagrama Técnico Vetorial SVG Limpo (Sem grade escura estática) */}
                <div className="md:col-span-5">
                  <div className={cn("rounded-xl p-3.5", subtleBoxClass)}>
                    <TechnicalConceptSvg diagram="cylinder" isLight={isLight} />
                  </div>
                </div>
              </div>
            </section>

            {/* 1.3 Acesso Rápido: Aulas Recomendadas / Histórico & Atalhos para Tabelas e Fórmulas */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                    Retomada em 1 Toque
                  </span>
                  <h3 className={cn("font-display text-sm sm:text-base", titleTextClass)}>
                    Estudos Recentes, Favoritos & Consultas Rápidas
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("trilhas")}
                  className="font-mono text-[11px] font-bold text-amber-500 hover:underline cursor-pointer"
                >
                  Ver todas (41)
                </button>
              </div>

              <div className="space-y-2">
                {recentOrFavoriteLessons.map(({ module, lesson }) => {
                  const st = academyState.lessons[lesson.id];
                  const isDone = st?.mastery === "dominado" || st?.mastery === "praticado";
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => openImmersiveLesson(lesson.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-all hover:border-amber-500/40 cursor-pointer",
                        subtleBoxClass,
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold",
                            isDone
                              ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                          )}
                        >
                          {isDone ? "✓" : module.code}
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-xs sm:text-[13px] font-bold truncate", titleTextClass)}>
                            {lesson.title}
                          </p>
                          <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                            Módulo {module.code}: {module.title} • {lesson.minutes} min
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-amber-500" />
                    </button>
                  );
                })}
              </div>

              {/* Atalhos diretos para Biblioteca NBR 11888 e Simulador de Fórmulas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("biblioteca");
                    setLibrarySubTab("tabelas");
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2.5 rounded-xl p-3 text-left transition-all hover:border-sky-500/40 cursor-pointer",
                    subtleBoxClass,
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TableProperties className="size-4 shrink-0 text-sky-500" />
                    <div className="min-w-0">
                      <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                        Tabelas NBR 11888 & Schedule 40
                      </p>
                      <p className={cn("text-[10.5px] truncate", subtitleTextClass)}>
                        Bitolas MSG, espessuras e calculadora de peso
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-sky-500" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("formulas");
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2.5 rounded-xl p-3 text-left transition-all hover:border-rose-500/40 cursor-pointer",
                    subtleBoxClass,
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Calculator className="size-4 shrink-0 text-rose-500" />
                    <div className="min-w-0">
                      <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                        Simulador de Fórmulas de Oficina
                      </p>
                      <p className={cn("text-[10.5px] truncate", subtitleTextClass)}>
                        Linha neutra, tronco de cone, Fator K e esquadro
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-rose-500" />
                </button>
              </div>
            </section>
          </div>
        )}

        {/* =====================================================================
            ABA 2: 🧭 TRILHAS (5 EIXOS INDUSTRIAIS + CURRÍCULO COMPLETO DE 41 LIÇÕES)
            ===================================================================== */}
        {activeTab === "trilhas" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  01 • ESCOLA DE ENGENHARIA & CHÃO DE FÁBRICA
                </span>
                <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                  5 Trilhas de Formação Técnica ({totalLessonsCount} Lições)
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setShowFullCurriculum((v) => !v);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase transition-colors cursor-pointer",
                  showFullCurriculum
                    ? "bg-amber-500 text-slate-950"
                    : cn(subtleBoxClass, titleTextClass),
                )}
              >
                <Layers className="size-3.5" />
                <span>
                  {showFullCurriculum
                    ? "Agrupar por 5 Trilhas"
                    : `Ver Currículo Completo (${totalLessonsCount} Lições)`}
                </span>
              </button>
            </div>

            {showFullCurriculum ? (
              /* Visualização Sequencial Completa dos 16 Módulos e 41 Lições */
              <div className="space-y-3">
                {CURRICULUM.map((module) => {
                  const doneCount = module.lessons.filter((l) => {
                    const m = academyState.lessons[l.id]?.mastery;
                    return m === "dominado" || m === "praticado";
                  }).length;
                  const modPct = Math.round(
                    (doneCount / Math.max(1, module.lessons.length)) * 100,
                  );

                  return (
                    <section
                      key={module.id}
                      style={cardSurfaceStyle}
                      className="rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[10px] font-bold uppercase text-amber-500">
                            MÓDULO {module.code} • {module.lessons.length} AULAS
                          </span>
                          <h3 className={cn("font-display text-sm sm:text-base", titleTextClass)}>
                            {module.title}
                          </h3>
                          <p className={cn("text-xs mt-0.5", subtitleTextClass)}>
                            {module.summary}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-amber-500 shrink-0">
                          {modPct}%
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {module.lessons.map((lesson) => {
                          const st = academyState.lessons[lesson.id];
                          const isDone =
                            st?.mastery === "dominado" || st?.mastery === "praticado";
                          const locked = !lesson.free && !isProUser;
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => openImmersiveLesson(lesson.id)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all hover:border-amber-500/40 cursor-pointer",
                                subtleBoxClass,
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isDone ? (
                                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <Play className="size-3.5 shrink-0 text-amber-500" />
                                )}
                                <span
                                  className={cn(
                                    "text-xs font-bold truncate",
                                    isLight ? "text-slate-800" : "text-slate-100",
                                  )}
                                >
                                  {lesson.title}
                                </span>
                                {!lesson.free && (
                                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-amber-500 uppercase shrink-0">
                                    PRO
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {locked && <Lock className="size-3 text-amber-500" />}
                                <span className={cn("font-mono text-[10px]", auxTextClass)}>
                                  {lesson.minutes}m
                                </span>
                                <ChevronRight className="size-3.5 text-amber-500" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              /* Visualização Estruturada nas 5 Trilhas de Especialização Técnica */
              <div className="space-y-3">
                {ACADEMY_TRACKS.map((track) => {
                  const prog = computeTrackProgress(track, academyState);
                  const isExpanded = expandedTrackId === track.id;

                  return (
                    <section
                      key={track.id}
                      style={cardSurfaceStyle}
                      className="rounded-2xl overflow-hidden transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setExpandedTrackId(isExpanded ? "" : track.id);
                        }}
                        className="flex w-full flex-col gap-3 p-4 sm:p-5 text-left cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-500 uppercase">
                              {track.number}
                            </span>
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold",
                                subtleBoxClass,
                                subtitleTextClass,
                              )}
                            >
                              {prog.totalModules}{" "}
                              {prog.totalModules === 1 ? "módulo" : "módulos"} •{" "}
                              {prog.totalLessons} aulas
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase",
                                prog.status === "Concluída"
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : prog.status === "Em andamento"
                                    ? "bg-amber-500/15 text-amber-500"
                                    : cn(subtleBoxClass, auxTextClass),
                              )}
                            >
                              {prog.status}
                            </span>
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform",
                                subtitleTextClass,
                                isExpanded && "rotate-180",
                              )}
                            />
                          </div>
                        </div>

                        <div>
                          <h3 className={cn("font-display text-base sm:text-lg leading-snug", titleTextClass)}>
                            {track.title}
                          </h3>
                          <p className={cn("text-xs mt-1 leading-relaxed", subtitleTextClass)}>
                            {track.description}
                          </p>
                        </div>

                        {/* Chips de destaques técnicos da trilha */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {track.highlights.map((h) => (
                            <span
                              key={h}
                              className={cn(
                                "rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold",
                                subtleBoxClass,
                                isLight ? "text-slate-700" : "text-slate-300",
                              )}
                            >
                              {h}
                            </span>
                          ))}
                        </div>

                        {/* Barra de progresso individual da trilha */}
                        <div className="w-full space-y-1 pt-0.5">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className={auxTextClass}>
                              {prog.completedLessons} de {prog.totalLessons} lições concluídas
                            </span>
                            <span className="font-bold text-amber-500">{prog.pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15">
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all duration-300"
                              style={{ width: `${prog.pct}%` }}
                            />
                          </div>
                        </div>
                      </button>

                      {/* Módulos e Aulas Internas da Trilha */}
                      {isExpanded && (
                        <div className="border-t border-slate-500/15 px-4 pb-4 pt-3 space-y-3">
                          {prog.modules.map((mod) => (
                            <div key={mod.id} className="space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <span className="font-mono text-[10.5px] font-bold uppercase text-amber-500">
                                  MÓDULO {mod.code} — {mod.title}
                                </span>
                                <span className={cn("font-mono text-[10px]", auxTextClass)}>
                                  {mod.lessons.length} lições
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                {mod.lessons.map((lesson) => {
                                  const st = academyState.lessons[lesson.id];
                                  const isDone =
                                    st?.mastery === "dominado" || st?.mastery === "praticado";
                                  const locked = !lesson.free && !isProUser;
                                  return (
                                    <button
                                      key={lesson.id}
                                      type="button"
                                      onClick={() => openImmersiveLesson(lesson.id)}
                                      className={cn(
                                        "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all hover:border-amber-500/40 cursor-pointer",
                                        subtleBoxClass,
                                      )}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {isDone ? (
                                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                                        ) : (
                                          <Play className="size-3.5 shrink-0 text-amber-500" />
                                        )}
                                        <span
                                          className={cn(
                                            "text-xs font-bold truncate",
                                            isLight ? "text-slate-800" : "text-slate-100",
                                          )}
                                        >
                                          {lesson.title}
                                        </span>
                                        {!lesson.free && (
                                          <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-amber-500 uppercase shrink-0">
                                            PRO
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        {locked && <Lock className="size-3 text-amber-500" />}
                                        <span className={cn("font-mono text-[10px]", auxTextClass)}>
                                          {lesson.minutes}m
                                        </span>
                                        <ChevronRight className="size-3.5 text-amber-500" />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            ABA 3: 📚 BIBLIOTECA (TABELAS NBR, CATÁLOGO & NORMAS, GLOSSÁRIO)
            ===================================================================== */}
        {activeTab === "biblioteca" && (
          <div className="space-y-4">
            {/* 3 Sub-Abas Superiores */}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "tabelas", label: "Tabelas NBR", icon: TableProperties },
                  { id: "catalogo", label: "Catálogo", icon: Library },
                  { id: "glossario", label: "Glossário", icon: BookOpen },
                ] as const
              ).map((sub) => {
                const Icon = sub.icon;
                const active = librarySubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      setLibrarySubTab(sub.id);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-xl py-2.5 px-1 font-mono text-[9.5px] min-[375px]:text-[11px] sm:text-xs font-bold uppercase transition-all cursor-pointer whitespace-nowrap",
                      active
                        ? "bg-sky-500 text-slate-950 shadow-sm"
                        : cn(subtleBoxClass, subtitleTextClass),
                    )}
                  >
                    <Icon className="size-3 sm:size-3.5 shrink-0" />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUB-ABA 3.1: 📊 TABELAS NORMATIVAS (4 COLUNAS PROPORCIONAIS SEM CORTE) */}
            {librarySubTab === "tabelas" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-3 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-sky-500">
                      03 • TABELAS NORMATIVAS DE OFICINA
                    </span>
                    <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                      Consulta Rápida & Calculadora de Chapa
                    </h2>
                  </div>

                  {/* Seletor de Tabela: Chapa Comercial | Tubulações | Materiais */}
                  <div className="flex flex-wrap items-center gap-1">
                    {SHOP_FLOOR_TABLES.map((t) => {
                      const active = activeTableId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic("selection");
                            setActiveTableId(t.id);
                          }}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer",
                            active
                              ? "bg-sky-500 text-slate-950"
                              : cn(subtleBoxClass, subtitleTextClass),
                          )}
                        >
                          {t.badge}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const currentTable =
                    SHOP_FLOOR_TABLES.find((t) => t.id === activeTableId) ??
                    SHOP_FLOOR_TABLES[0]!;
                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-500/15">
                        <div className="flex items-center gap-2">
                          <h3 className={cn("font-display text-xs sm:text-sm font-bold", titleTextClass)}>
                            {currentTable.title}
                          </h3>
                          <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 font-mono text-[9.5px] font-bold text-sky-500">
                            {currentTable.code}
                          </span>
                        </div>
                        <span className={cn("font-mono text-[10px]", auxTextClass)}>
                          Toque em uma linha para calcular peso
                        </span>
                      </div>

                      {/* Cabeçalho da Grade Proporcional de 4 Colunas Sem Corte */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.1fr 1fr 0.95fr 1fr",
                          gap: "4px",
                          alignItems: "center",
                        }}
                        className={cn(
                          "px-2 py-2 rounded-lg font-mono text-[9.5px] min-[375px]:text-[10.5px] sm:text-[11px] font-bold uppercase",
                          subtleBoxClass,
                          subtitleTextClass,
                        )}
                      >
                        <span>{currentTable.headers[0]}</span>
                        <span>{currentTable.headers[1]}</span>
                        <span>{currentTable.headers[2]}</span>
                        <span className="text-right">{currentTable.headers[3]}</span>
                      </div>

                      {/* Linhas da Tabela em Grade Proporcional 4 Colunas */}
                      <div className="divide-y divide-slate-500/15">
                        {currentTable.data.map((row) => (
                          <button
                            key={row.spec}
                            type="button"
                            onClick={() => {
                              triggerHaptic("tap");
                              AudioManager.play("ui_pop");
                              setSelectedTableRowSheet({ table: currentTable, row });
                            }}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1.1fr 1fr 0.95fr 1fr",
                              gap: "4px",
                              alignItems: "center",
                            }}
                            className={cn(
                              "w-full px-2 py-2.5 text-left font-mono text-[10px] min-[375px]:text-[11.5px] sm:text-[12px] rounded-lg transition-colors cursor-pointer",
                              isLight
                                ? "hover:bg-slate-900/[0.04]"
                                : "hover:bg-white/[0.05]",
                            )}
                          >
                            <span
                              className={cn(
                                "font-bold whitespace-nowrap",
                                isLight ? "text-slate-900" : "text-slate-100",
                              )}
                            >
                              {row.spec}
                            </span>
                            <span className="font-bold text-sky-500 whitespace-nowrap">{row.mm}</span>
                            <span className={cn("whitespace-nowrap", subtitleTextClass)}>{row.pol}</span>
                            <span
                              className={cn(
                                "text-right font-semibold whitespace-nowrap",
                                isLight ? "text-slate-800" : "text-slate-200",
                              )}
                            >
                              {row.peso}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </section>
            )}

            {/* SUB-ABA 3.2: 🗂️ CATÁLOGO & NORMAS (CARDS TÉCNICOS COMPACTOS E ESCANEÁVEIS) */}
            {librarySubTab === "catalogo" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                    04 • BIBLIOTECA & ACERVO TÉCNICO
                  </span>
                  <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                    Catálogo de Tubos NPS, Perfis, Soldagem & Normas
                  </h2>
                </div>

                {/* Chips de Categoria com Contador Real */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      "Todos",
                      "Tubos",
                      "Chapas",
                      "Perfis",
                      "Materiais",
                      "Soldagem",
                      "Tolerâncias",
                      "Normas",
                    ] as const
                  ).map((cat) => {
                    const count =
                      cat === "Todos"
                        ? EXTENDED_CATALOG_ITEMS.length
                        : EXTENDED_CATALOG_ITEMS.filter((i) => i.category === cat).length;
                    const active = catalogCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setCatalogCategory(cat);
                        }}
                        className={cn(
                          "rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer",
                          active
                            ? "bg-emerald-500 text-slate-950"
                            : cn(subtleBoxClass, subtitleTextClass),
                        )}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Lista de Cards Técnicos Compactos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visibleCatalogItems.map((item) => {
                    const isFav = catalogFavs.includes(item.id);
                    const locked = item.premium && !isProUser;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex flex-col justify-between rounded-xl p-3.5 transition-all hover:border-emerald-500/40",
                          subtleBoxClass,
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-500">
                                {item.category}
                              </span>
                              {item.premium && (
                                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-500">
                                  PRO
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleCatalogFav(item.id)}
                              aria-label={`Favoritar ${item.title}`}
                              className="p-1 rounded-lg cursor-pointer"
                            >
                              <Star
                                className={cn(
                                  "size-3.5",
                                  isFav
                                    ? "fill-amber-400 text-amber-400"
                                    : subtitleTextClass,
                                )}
                              />
                            </button>
                          </div>

                          <h3 className={cn("font-display text-sm", titleTextClass)}>
                            {item.title}
                          </h3>
                          <p className={cn("text-xs mt-0.5 leading-snug", subtitleTextClass)}>
                            {item.detail}
                          </p>

                          {/* 2 Parâmetros Principais em Destaque */}
                          <div className="mt-2.5 pt-2 border-t border-slate-500/15 grid grid-cols-2 gap-2 font-mono text-[11px]">
                            {item.data.slice(0, 2).map((d) => (
                              <div key={d.label} className="min-w-0">
                                <span className={cn("block text-[9px] uppercase truncate", auxTextClass)}>
                                  {d.label}
                                </span>
                                <span
                                  className={cn(
                                    "font-bold truncate block",
                                    isLight ? "text-slate-900" : "text-slate-100",
                                  )}
                                >
                                  {d.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic("tap");
                            AudioManager.play("ui_pop");
                            setSelectedCatalogItemSheet(item);
                          }}
                          className="mt-3 pt-2 border-t border-slate-500/15 flex w-full items-center justify-between font-mono text-[10.5px] font-bold uppercase text-emerald-500 hover:underline cursor-pointer"
                        >
                          <span>
                            {locked ? "Ver Especificação (PRO)" : "Ver Especificação Completa"}
                          </span>
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SUB-ABA 3.3: 📖 GLOSSÁRIO DE OFICINA */}
            {librarySubTab === "glossario" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                    DICIONÁRIO TÉCNICO INDUSTRIAL
                  </span>
                  <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                    Glossário de Caldeiraria, Traçagem & Serralheria
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GLOSSARY_ITEMS.map((g) => (
                    <div key={g.id} className={cn("rounded-xl p-3.5 space-y-1.5", subtleBoxClass)}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={cn("font-display text-sm", titleTextClass)}>{g.term}</h3>
                        <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-500">
                          {g.category}
                        </span>
                      </div>
                      <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                        {g.summary}
                      </p>
                      <p className="pt-1 font-mono text-[10.5px] text-emerald-500">
                        <strong>Regra prática:</strong> {g.practicalRule}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* =====================================================================
            ABA 4: 📐 FÓRMULAS (FORMULÁRIO DE ENGENHARIA COM MINI-SIMULADOR AO VIVO)
            ===================================================================== */}
        {activeTab === "formulas" && (
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-500">
                  02 • RELAÇÕES MATEMÁTICAS & FÓRMULAS DE OFICINA
                </span>
                <h2 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                  Formulário Interativo com Mini-Simulador ao Vivo
                </h2>
              </div>

              {/* Agrupamento por Aplicação */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    "Todas",
                    "Calandragem & Linha Neutra",
                    "Cones & Traçagem",
                    "Dobra & Fator K",
                    "Arcos & Esquadro",
                    "Massa & Pesos",
                  ] as const
                ).map((grp) => {
                  const active = formulaGroup === grp;
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setFormulaGroup(grp);
                      }}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer",
                        active
                          ? "bg-rose-500 text-white shadow-sm"
                          : cn(subtleBoxClass, subtitleTextClass),
                      )}
                    >
                      {grp}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista Vertical de Cards de Fórmulas com Mini-Simulador Expansível */}
            <div className="space-y-3.5">
              {visibleFormulas.map((f) => {
                const isSimOpen = !!expandedSimulators[f.id];
                const currentVals = formulaInputs[f.id] ?? f.defaultInputs;
                const result = f.compute(currentVals);

                return (
                  <section
                    key={f.id}
                    style={cardSurfaceStyle}
                    className="rounded-2xl p-4 sm:p-5 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase text-rose-500">
                          {f.legacyCategoryBadge} • {f.code}
                        </span>
                        <span className={cn("font-mono text-[10px]", auxTextClass)}>
                          [{f.unit}]
                        </span>
                      </div>

                      <Link
                        to={f.practicalTool}
                        onClick={() => {
                          triggerHaptic("selection");
                          AudioManager.play("ui_nav");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-sky-500/12 border border-sky-500/30 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-sky-500 hover:bg-sky-500/20 transition-colors cursor-pointer"
                      >
                        <span>{f.toolLabel}</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>

                    <div>
                      <h3 className={cn("font-display text-base sm:text-lg", titleTextClass)}>
                        {f.name}
                      </h3>
                      <p className={cn("text-xs mt-1 leading-relaxed", subtitleTextClass)}>
                        {f.description}
                      </p>
                    </div>

                    {/* Equação Matemática de Alta Legibilidade */}
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl p-3",
                        subtleBoxClass,
                      )}
                    >
                      <span className="font-mono text-sm sm:text-base font-extrabold text-rose-500 tracking-wide">
                        {f.formula}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(f.id, f.formula)}
                        aria-label={`Copiar fórmula ${f.name}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[10px] cursor-pointer",
                          subtleBoxClass,
                          subtitleTextClass,
                        )}
                      >
                        {copiedId === f.id ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        <span>{copiedId === f.id ? "Copiado" : "Copiar"}</span>
                      </button>
                    </div>

                    {/* Legenda de Variáveis */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {f.variables.map((v) => (
                        <div key={v.sym} className={cn("rounded-lg p-2 font-mono", subtleBoxClass)}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-500">{v.sym}</span>
                            <span className={cn("text-[9px]", auxTextClass)}>{v.unit}</span>
                          </div>
                          <p className={cn("text-[10px] truncate mt-0.5", subtitleTextClass)}>
                            {v.name}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Exemplo Resolvido */}
                    <p className={cn("font-mono text-[11px] leading-relaxed", subtitleTextClass)}>
                      <strong className="text-emerald-500">Exemplo de Oficina:</strong>{" "}
                      {f.exampleSolved}
                    </p>

                    {/* Botão para Abrir/Fechar o Mini-Simulador Interativo */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setExpandedSimulators((prev) => ({ ...prev, [f.id]: !isSimOpen }));
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold uppercase transition-all cursor-pointer",
                          isSimOpen
                            ? "bg-amber-500 text-slate-950 shadow-sm"
                            : "bg-amber-500/15 border border-amber-500/35 text-amber-500 hover:bg-amber-500/25",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <Zap className="size-3.5 shrink-0" />
                          <span>Simular / Calcular Fórmula ao Vivo</span>
                        </span>
                        <ChevronDown
                          className={cn("size-4 transition-transform", isSimOpen && "rotate-180")}
                        />
                      </button>

                      {isSimOpen && (
                        <div className={cn("mt-2.5 rounded-xl p-3.5 space-y-3", subtleBoxClass)}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {f.inputFields.map((field) => (
                              <label key={field.key} className="block space-y-1">
                                <span
                                  className={cn(
                                    "block font-mono text-[10px] font-bold truncate",
                                    subtitleTextClass,
                                  )}
                                >
                                  {field.label} {field.unit ? `(${field.unit})` : ""}
                                </span>
                                <input
                                  type="number"
                                  step={field.step ?? 1}
                                  min={field.min ?? 0}
                                  value={currentVals[field.key] ?? 0}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setFormulaInputs((prev) => ({
                                      ...prev,
                                      [f.id]: {
                                        ...(prev[f.id] ?? f.defaultInputs),
                                        [field.key]: Number.isFinite(val) ? val : 0,
                                      },
                                    }));
                                  }}
                                  className={cn(
                                    "w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none border focus:border-amber-500",
                                    isLight
                                      ? "bg-white border-slate-300 text-slate-900"
                                      : "bg-slate-900 border-white/15 text-slate-100",
                                  )}
                                />
                              </label>
                            ))}
                          </div>

                          {/* Resultado Calculado em Tempo Real */}
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3">
                            <div className="space-y-0.5">
                              <span className="font-mono text-[9.5px] font-bold uppercase text-emerald-500 block">
                                {result.primaryLabel}
                              </span>
                              <span
                                className={cn(
                                  "font-mono text-base sm:text-lg font-extrabold",
                                  isLight ? "text-slate-900" : "text-white",
                                )}
                              >
                                {result.primaryValue}
                              </span>
                            </div>

                            {result.secondaryLabel && result.secondaryValue && (
                              <div className="space-y-0.5 text-right">
                                <span className={cn("font-mono text-[9.5px] uppercase block", subtitleTextClass)}>
                                  {result.secondaryLabel}
                                </span>
                                <span className="font-mono text-sm font-bold text-amber-500">
                                  {result.secondaryValue}
                                </span>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(
                                  `${f.id}-res`,
                                  `${result.primaryLabel}: ${result.primaryValue}${
                                    result.secondaryLabel
                                      ? ` | ${result.secondaryLabel}: ${result.secondaryValue}`
                                      : ""
                                  }`,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1.5 font-mono text-[10px] font-bold text-emerald-500 cursor-pointer"
                            >
                              {copiedId === `${f.id}-res` ? (
                                <Check className="size-3.5" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              <span>{copiedId === `${f.id}-res` ? "Copiado" : "Copiar Valor"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            BOTTOM SHEET INTERATIVO 1: DETALHE DA BITOLA + CALCULADORA DE PESO DE CHAPA
            ===================================================================== */}
        {selectedTableRowSheet && (
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 pb-[calc(104px+env(safe-area-inset-bottom,16px))] sm:p-4 animate-in fade-in duration-150">
            <div
              style={cardSurfaceStyle}
              className="w-full max-w-lg rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-sky-500">
                    {selectedTableRowSheet.table.code} • {selectedTableRowSheet.table.badge}
                  </span>
                  <h3 className={cn("font-display text-lg mt-1", titleTextClass)}>
                    {selectedTableRowSheet.row.spec} — {selectedTableRowSheet.row.mm}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTableRowSheet(null)}
                  aria-label="Fechar painel"
                  className={cn("p-1.5 rounded-xl cursor-pointer", subtleBoxClass, subtitleTextClass)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div className={cn("rounded-xl p-2.5", subtleBoxClass)}>
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[1]}
                  </span>
                  <span className="font-bold text-sky-500">{selectedTableRowSheet.row.mm}</span>
                </div>
                <div className={cn("rounded-xl p-2.5", subtleBoxClass)}>
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[2]}
                  </span>
                  <span className={cn("font-bold", titleTextClass)}>
                    {selectedTableRowSheet.row.pol}
                  </span>
                </div>
                <div className={cn("rounded-xl p-2.5", subtleBoxClass)}>
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[3]}
                  </span>
                  <span className="font-bold text-amber-500">{selectedTableRowSheet.row.peso}</span>
                </div>
              </div>

              {selectedTableRowSheet.row.notes && (
                <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                  {selectedTableRowSheet.row.notes}
                </p>
              )}

              {/* Calculadora Instantânea de Peso de Chapa (Largura × Comprimento) */}
              {selectedTableRowSheet.row.numericThicknessMm && (
                <div className={cn("rounded-xl p-3.5 space-y-3", subtleBoxClass)}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-bold uppercase text-amber-500 flex items-center gap-1.5">
                      <Calculator className="size-3.5" />
                      Calculadora Instantânea de Peso (Aço 7,85 g/cm³)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="space-y-1">
                      <span className={cn("block font-mono text-[10px]", subtitleTextClass)}>
                        Largura (mm)
                      </span>
                      <input
                        type="number"
                        value={sheetCalcWidth}
                        onChange={(e) => setSheetCalcWidth(Math.max(0, Number(e.target.value) || 0))}
                        className={cn(
                          "w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none border",
                          isLight
                            ? "bg-white border-slate-300 text-slate-900"
                            : "bg-slate-900 border-white/15 text-slate-100",
                        )}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={cn("block font-mono text-[10px]", subtitleTextClass)}>
                        Comprimento (mm)
                      </span>
                      <input
                        type="number"
                        value={sheetCalcLength}
                        onChange={(e) =>
                          setSheetCalcLength(Math.max(0, Number(e.target.value) || 0))
                        }
                        className={cn(
                          "w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none border",
                          isLight
                            ? "bg-white border-slate-300 text-slate-900"
                            : "bg-slate-900 border-white/15 text-slate-100",
                        )}
                      />
                    </label>
                  </div>

                  {(() => {
                    const calc = calcSheetWeight(
                      sheetCalcWidth,
                      sheetCalcLength,
                      selectedTableRowSheet.row.numericThicknessMm,
                      7.85,
                    );
                    return (
                      <div className="flex items-center justify-between rounded-xl bg-emerald-500/12 border border-emerald-500/30 px-3 py-2.5 font-mono">
                        <div>
                          <span className="text-[9.5px] uppercase text-emerald-500 block font-bold">
                            Área Calculada
                          </span>
                          <span className={cn("text-sm font-bold", titleTextClass)}>
                            {calc.areaM2.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            m²
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9.5px] uppercase text-emerald-500 block font-bold">
                            Peso Real da Chapa
                          </span>
                          <span className="text-base font-extrabold text-emerald-500">
                            {calc.weightKg.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            kg
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      "sheet-spec",
                      `${selectedTableRowSheet.row.spec} • ${selectedTableRowSheet.row.mm} • ${selectedTableRowSheet.row.pol} • ${selectedTableRowSheet.row.peso}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 font-mono text-xs font-bold text-slate-950 cursor-pointer"
                >
                  {copiedId === "sheet-spec" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>
                    {copiedId === "sheet-spec"
                      ? "Especificação Copiada!"
                      : "Copiar Especificação"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            BOTTOM SHEET INTERATIVO 2: DETALHE DO ITEM DO CATÁLOGO
            ===================================================================== */}
        {selectedCatalogItemSheet && (
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 pb-[calc(104px+env(safe-area-inset-bottom,16px))] sm:p-4 animate-in fade-in duration-150">
            <div
              style={cardSurfaceStyle}
              className="w-full max-w-lg rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-500">
                      {selectedCatalogItemSheet.category}
                    </span>
                    {selectedCatalogItemSheet.premium && (
                      <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-500">
                        PRO
                      </span>
                    )}
                  </div>
                  <h3 className={cn("font-display text-lg mt-1", titleTextClass)}>
                    {selectedCatalogItemSheet.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCatalogItemSheet(null)}
                  aria-label="Fechar painel"
                  className={cn("p-1.5 rounded-xl cursor-pointer", subtleBoxClass, subtitleTextClass)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                {selectedCatalogItemSheet.detail}
              </p>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {selectedCatalogItemSheet.data.map((d) => (
                  <div key={d.label} className={cn("rounded-xl p-3", subtleBoxClass)}>
                    <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                      {d.label}
                    </span>
                    <span className={cn("font-bold mt-0.5 block", titleTextClass)}>
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      "cat-spec",
                      `${selectedCatalogItemSheet.title}: ${selectedCatalogItemSheet.data
                        .map((d) => `${d.label} = ${d.value}`)
                        .join(" | ")}`,
                    )
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-mono text-xs font-bold cursor-pointer",
                    subtleBoxClass,
                    titleTextClass,
                  )}
                >
                  {copiedId === "cat-spec" ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>{copiedId === "cat-spec" ? "Copiado" : "Copiar Dados"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCatalogItemSheet(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-slate-950 cursor-pointer"
                >
                  <span>Concluído</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </NavigationAreaContainer>
    </div>
  );
}

/* =========================================================================
   DIAGRAMA TÉCNICO VETORIAL SVG (ADAPTÁVEL AO TEMA — SEM GRADE ESCURA FIXA)
   ========================================================================= */

function TechnicalConceptSvg({
  diagram,
  isLight,
}: {
  diagram: "cylinder" | "cone" | "transition" | "elbow" | "sheet" | "bend" | "diagonal" | "chord";
  isLight: boolean;
}) {
  const strokeMain = isLight ? "#0F172A" : "#F8FAFC";
  const strokeAccent = "#F59E0B";
  const strokeCyan = isLight ? "#0284C7" : "#38BDF8";
  const strokeMuted = isLight ? "#94A3B8" : "#64748B";

  if (diagram === "cone") {
    return (
      <svg viewBox="0 0 280 150" className="w-full h-auto" fill="none">
        {/* Tronco de cone e geratriz G */}
        <polygon
          points="70,125 210,125 175,35 105,35"
          stroke={strokeMain}
          strokeWidth="1.8"
          fill="rgba(245,158,11,0.08)"
        />
        <line x1="140" y1="20" x2="140" y2="135" stroke={strokeMuted} strokeDasharray="4 3" />
        <line x1="175" y1="35" x2="175" y2="125" stroke={strokeCyan} strokeDasharray="3 3" />
        <line x1="175" y1="35" x2="210" y2="125" stroke={strokeAccent} strokeWidth="2.5" />
        <text x="198" y="80" fill={strokeAccent} fontSize="10" fontFamily="monospace" fontWeight="bold">
          G = √(H²+(R-r)²)
        </text>
        <text x="144" y="85" fill={strokeCyan} fontSize="9.5" fontFamily="monospace">
          H
        </text>
        <text x="115" y="142" fill={strokeMain} fontSize="9.5" fontFamily="monospace">
          D1 = 2R
        </text>
      </svg>
    );
  }

  if (diagram === "bend") {
    return (
      <svg viewBox="0 0 280 150" className="w-full h-auto" fill="none">
        {/* Dobra 90° e Linha Neutra K·t */}
        <path
          d="M 55 30 L 55 95 A 30 30 0 0 0 85 125 L 220 125"
          stroke={strokeMain}
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d="M 55 30 L 55 95 A 30 30 0 0 0 85 125 L 220 125"
          stroke={strokeAccent}
          strokeWidth="2"
          strokeDasharray="5 3"
        />
        <text x="95" y="75" fill={strokeAccent} fontSize="10" fontFamily="monospace" fontWeight="bold">
          BA = θ·(π/180)·(R + K·t)
        </text>
        <text x="95" y="95" fill={strokeCyan} fontSize="9.5" fontFamily="monospace">
          Fibra Neutra (Fator K)
        </text>
      </svg>
    );
  }

  if (diagram === "diagonal") {
    return (
      <svg viewBox="0 0 280 150" className="w-full h-auto" fill="none">
        <rect
          x="45"
          y="25"
          width="190"
          height="100"
          stroke={strokeMain}
          strokeWidth="2"
          fill="rgba(56,189,248,0.06)"
        />
        <line x1="45" y1="125" x2="235" y2="25" stroke={strokeAccent} strokeWidth="2.2" />
        <text x="95" y="72" fill={strokeAccent} fontSize="10" fontFamily="monospace" fontWeight="bold">
          D = √(L² + C²)
        </text>
        <text x="115" y="140" fill={strokeCyan} fontSize="9.5" fontFamily="monospace">
          C = 4000 mm
        </text>
      </svg>
    );
  }

  // Padrão: Cilindro / Linha Neutra Dn = Dext - t + Desenvolvimento
  return (
    <svg viewBox="0 0 280 150" className="w-full h-auto" fill="none">
      {/* Virola circular à esquerda */}
      <circle cx="68" cy="75" r="44" stroke={strokeMain} strokeWidth="6" opacity="0.22" />
      <circle
        cx="68"
        cy="75"
        r="44"
        stroke={strokeAccent}
        strokeWidth="1.8"
        strokeDasharray="4 3"
      />
      <line x1="24" y1="75" x2="112" y2="75" stroke={strokeCyan} strokeWidth="1.5" />
      <text
        x="68"
        y="69"
        textAnchor="middle"
        fill={strokeCyan}
        fontSize="8.8"
        fontFamily="monospace"
        fontWeight="bold"
      >
        Dn = Dext - t
      </text>

      {/* Seta de planificação */}
      <path d="M 120 75 L 144 75" stroke={strokeAccent} strokeWidth="1.8" />
      <polyline points="139,71 145,75 139,79" stroke={strokeAccent} strokeWidth="1.8" fill="none" />

      {/* Chapa desenvolvida à direita */}
      <rect
        x="152"
        y="36"
        width="116"
        height="78"
        rx="4"
        stroke={strokeMain}
        strokeWidth="1.8"
        fill="rgba(245,158,11,0.08)"
      />
      <text
        x="210"
        y="74"
        textAnchor="middle"
        fill={strokeAccent}
        fontSize="10"
        fontFamily="monospace"
        fontWeight="bold"
      >
        P = π × Dn
      </text>
      <text
        x="210"
        y="91"
        textAnchor="middle"
        fill={strokeMuted}
        fontSize="8.2"
        fontFamily="monospace"
      >
        Corte reto s/ fresta
      </text>
    </svg>
  );
}
