import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
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
  AlertTriangle,
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
  type NormativeTableRow,
  type NormativeTableSpec,
  type ExtendedCatalogItem,
} from "@/lib/education/academyEngine";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useSettings, type AccentColor } from "@/lib/settings/SettingsProvider";
import { hexToRgbChannels } from "@/lib/settings/appearancePreferences";
import { resolveEffectiveThemeId, type EffectiveThemeId } from "@/lib/settings/themeTransitionEngine";
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

interface DerivedAccentTokens {
  accentPrimary: string;
  accentHover: string;
  accentRgb: string;
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  accentFocusRing: string;
  accentSolidFg: string;
  accentTabBg: string;
  accentTabFg: string;
}

/**
 * CAMADA B — Deriva todos os tokens `--accent-*` a partir da Cor de Destaque
 * escolhida pelo usuário (Azul, Âmbar, Laranja/Coral, Violeta, Verde, Ciano,
 * Vermelho Carmesim ou Neutro) e do slider `bubbleOpacity` (20% a 100%),
 * garantindo contraste mínimo WCAG AA >= 4,5:1 em qualquer tema.
 */
function deriveAccentLayerTokens(
  accentSetting: AccentColor | string,
  domAccentHex: string | null,
  isLight: boolean,
  bubbleOpacityPct: number,
): DerivedAccentTokens {
  const rawCandidate = (domAccentHex || accentSetting || "blue").trim().toLowerCase();
  const clampedBubble = Math.min(100, Math.max(20, bubbleOpacityPct));
  const bubbleRatio = (clampedBubble - 20) / 80; // 0..1

  // Alpha limitado a <= 0.35 para chips/badges com texto colorido (--accent-text)
  const softAlpha = (0.10 + bubbleRatio * 0.25).toFixed(3);
  // Alpha da aba principal Nível 1 (acompanha bubbleOpacity de 0.16 até 0.92)
  const tabAlpha = (0.16 + bubbleRatio * 0.76).toFixed(3);
  const useSolidTabFg = clampedBubble >= 52;

  // Identificação semântica de paleta de destaque
  let primaryHex = isLight ? "#0066FF" : "#3B82F6";
  let hoverHex = isLight ? "#0052CC" : "#2563EB";
  let textHex = isLight ? "#0052CC" : "#60A5FA";
  let solidFg = "#FFFFFF";
  let rgb = "0, 102, 255";

  if (
    rawCandidate === "amber" ||
    rawCandidate === "ambar" ||
    rawCandidate === "#f59e0b" ||
    rawCandidate === "#d97706"
  ) {
    primaryHex = isLight ? "#D97706" : "#F59E0B";
    hoverHex = isLight ? "#B45309" : "#D97706";
    textHex = isLight ? "#B45309" : "#FBBF24";
    solidFg = isLight ? "#FFFFFF" : "#0F172A";
    rgb = "245, 158, 11";
  } else if (
    rawCandidate === "orange" ||
    rawCandidate === "laranja" ||
    rawCandidate === "coral" ||
    rawCandidate === "#f97316" ||
    rawCandidate === "#ea580c"
  ) {
    primaryHex = isLight ? "#EA580C" : "#F97316";
    hoverHex = isLight ? "#C2410C" : "#EA580C";
    textHex = isLight ? "#C2410C" : "#FB923C";
    solidFg = "#FFFFFF";
    rgb = "249, 115, 22";
  } else if (
    rawCandidate === "violet" ||
    rawCandidate === "violeta" ||
    rawCandidate === "purple" ||
    rawCandidate === "#7c3aed" ||
    rawCandidate === "#8b5cf6" ||
    rawCandidate === "#a78bfa"
  ) {
    primaryHex = isLight ? "#7C3AED" : "#8B5CF6";
    hoverHex = isLight ? "#6D28D9" : "#7C3AED";
    textHex = isLight ? "#6D28D9" : "#C4B5FD";
    solidFg = "#FFFFFF";
    rgb = "139, 92, 246";
  } else if (
    rawCandidate === "green" ||
    rawCandidate === "verde" ||
    rawCandidate === "emerald" ||
    rawCandidate === "#10b981" ||
    rawCandidate === "#059669"
  ) {
    primaryHex = isLight ? "#059669" : "#10B981";
    hoverHex = isLight ? "#047857" : "#059669";
    textHex = isLight ? "#047857" : "#34D399";
    solidFg = "#FFFFFF";
    rgb = "16, 185, 129";
  } else if (
    rawCandidate === "cyan" ||
    rawCandidate === "ciano" ||
    rawCandidate === "#06b6d4" ||
    rawCandidate === "#0891b2" ||
    rawCandidate === "#00ccff"
  ) {
    primaryHex = isLight ? "#0891B2" : "#06B6D4";
    hoverHex = isLight ? "#0E7490" : "#0891B2";
    textHex = isLight ? "#0E7490" : "#22D3EE";
    solidFg = "#FFFFFF";
    rgb = "6, 182, 212";
  } else if (
    rawCandidate === "crimson" ||
    rawCandidate === "magenta" ||
    rawCandidate === "vermelho" ||
    rawCandidate === "red" ||
    rawCandidate === "#b22222" ||
    rawCandidate === "#ef4444" ||
    rawCandidate === "#dc2626"
  ) {
    primaryHex = isLight ? "#B22222" : "#EF4444";
    hoverHex = isLight ? "#991B1B" : "#DC2626";
    textHex = isLight ? "#991B1B" : "#F87171";
    solidFg = "#FFFFFF";
    rgb = isLight ? "178, 34, 34" : "239, 68, 68";
  } else if (
    rawCandidate === "default" ||
    rawCandidate === "neutro" ||
    rawCandidate === "#0f172a" ||
    rawCandidate === "#e2e8f0"
  ) {
    primaryHex = isLight ? "#0F172A" : "#E2E8F0";
    hoverHex = isLight ? "#1E293B" : "#F8FAFC";
    textHex = isLight ? "#0F172A" : "#F8FAFC";
    solidFg = isLight ? "#FFFFFF" : "#0F172A";
    rgb = isLight ? "15, 23, 42" : "226, 232, 240";
  } else if (rawCandidate.startsWith("#")) {
    const parsed = hexToRgbChannels(rawCandidate);
    if (parsed) {
      primaryHex = rawCandidate.toUpperCase();
      hoverHex = rawCandidate.toUpperCase();
      textHex = rawCandidate.toUpperCase();
      rgb = parsed.rgb;
      const lum = (0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b) / 255;
      solidFg = lum > 0.62 ? "#0F172A" : "#FFFFFF";
    }
  }

  return {
    accentPrimary: primaryHex,
    accentHover: hoverHex,
    accentRgb: rgb,
    accentText: textHex,
    accentSoft: `rgba(${rgb}, ${softAlpha})`,
    accentBorder: `rgba(${rgb}, 0.38)`,
    accentFocusRing: `rgba(${rgb}, 0.45)`,
    accentSolidFg: solidFg,
    accentTabBg: useSolidTabFg ? primaryHex : `rgba(${rgb}, ${tabAlpha})`,
    accentTabFg: useSolidTabFg ? solidFg : textHex,
  };
}

export function AprendaPage() {
  useNavigate();
  const academyState = useAcademy();
  const next = nextLesson(academyState);
  const { can } = useFeatureAccess();
  const isProUser = can("school.full");

  const { theme, accent, cardOpacity, bubbleOpacity } = useSettings();

  // Observador em tempo real do DOM para reagir imediatamente a trocas de tema, classe ou variáveis CSS
  const [domThemeOverride, setDomThemeOverride] = useState<EffectiveThemeId | null>(null);
  const [domAccentHex, setDomAccentHex] = useState<string | null>(null);
  const [domCardOpacity, setDomCardOpacity] = useState<number | null>(null);
  const [domBubbleOpacity, setDomBubbleOpacity] = useState<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    const syncFromDom = () => {
      const attrTheme = root.dataset.theme;
      if (attrTheme === "light" || attrTheme === "dark" || attrTheme === "amoled") {
        setDomThemeOverride(attrTheme);
      } else if (root.classList.contains("amoled")) {
        setDomThemeOverride("amoled");
      } else if (root.classList.contains("dark")) {
        setDomThemeOverride("dark");
      } else {
        setDomThemeOverride(null);
      }

      const inlineAccent = root.style.getPropertyValue("--accent-color")?.trim() || null;
      const lsAccent =
        typeof window !== "undefined"
          ? window.localStorage.getItem("caldra_accent_color")?.trim() || null
          : null;
      setDomAccentHex(inlineAccent || lsAccent);

      const inlineCardOp = parseFloat(root.style.getPropertyValue("--card-opacity"));
      if (Number.isFinite(inlineCardOp) && inlineCardOp > 0) {
        setDomCardOpacity(
          inlineCardOp <= 1 ? Math.round(inlineCardOp * 100) : Math.round(inlineCardOp),
        );
      } else {
        setDomCardOpacity(null);
      }

      const inlineBubbleOp = parseFloat(root.style.getPropertyValue("--bubble-opacity"));
      if (Number.isFinite(inlineBubbleOp) && inlineBubbleOp > 0) {
        setDomBubbleOpacity(
          inlineBubbleOp <= 1 ? Math.round(inlineBubbleOp * 100) : Math.round(inlineBubbleOp),
        );
      } else {
        setDomBubbleOpacity(null);
      }
    };

    syncFromDom();

    const observer = new MutationObserver(syncFromDom);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });

    const mql =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onMediaChange = () => syncFromDom();
    mql?.addEventListener?.("change", onMediaChange);

    return () => {
      observer.disconnect();
      mql?.removeEventListener?.("change", onMediaChange);
    };
  }, [theme, accent, cardOpacity, bubbleOpacity]);

  const effectiveTheme: EffectiveThemeId = domThemeOverride ?? resolveEffectiveThemeId(theme);
  const isLight = effectiveTheme === "light";
  const isAmoled = effectiveTheme === "amoled";

  const effectiveCardOpacityPct = domCardOpacity ?? cardOpacity;
  const effectiveBubbleOpacityPct = domBubbleOpacity ?? bubbleOpacity;

  // Derivação da Camada B (Cor de Destaque + Opacidade das Bolhas)
  const accentTokens = useMemo(
    () =>
      deriveAccentLayerTokens(
        accent,
        domAccentHex,
        isLight,
        effectiveBubbleOpacityPct,
      ),
    [accent, domAccentHex, isLight, effectiveBubbleOpacityPct],
  );

  /* =========================================================================
     ARQUITETURA CENTRALIZADA DE TOKENS CSS (4 CAMADAS INDEPENDENTES)
     ========================================================================= */
  const academyCssVariables = useMemo<React.CSSProperties>(() => {
    const cardAlpha = (Math.min(100, Math.max(20, effectiveCardOpacityPct)) / 100).toFixed(2);

    // CAMADA A — Superfície e Tema + Opacidade dos Cartões
    const surfaceCard = isLight
      ? `rgba(255, 255, 255, var(--card-opacity, ${cardAlpha}))`
      : isAmoled
        ? `rgba(5, 8, 15, var(--card-opacity, ${cardAlpha}))`
        : `rgba(15, 23, 42, var(--card-opacity, ${cardAlpha}))`;

    const surfaceElevated = isLight
      ? `rgba(241, 245, 249, calc(var(--card-opacity, ${cardAlpha}) * 0.78))`
      : isAmoled
        ? `rgba(10, 15, 28, calc(var(--card-opacity, ${cardAlpha}) * 0.78))`
        : `rgba(2, 6, 23, calc(var(--card-opacity, ${cardAlpha}) * 0.78))`;

    const borderSubtle = isLight
      ? "rgba(15, 23, 42, 0.09)"
      : isAmoled
        ? "rgba(255, 255, 255, 0.12)"
        : "rgba(255, 255, 255, 0.09)";

    const textPrimary = isLight ? "#0F172A" : isAmoled ? "#FFFFFF" : "#F8FAFC";
    const textSecondary = isLight ? "#475569" : "#94A3B8";
    const textMuted = "#64748B";

    // CAMADA C — Cores de Identidade das Áreas e Domínios Técnicos (Fixas e Discretas)
    const domainCaldeiraria = isLight ? "#D97706" : "#F59E0B";
    const domainEstruturas = isLight ? "#0284C7" : "#38BDF8";
    const domainTrilhas = isLight ? "#7C3AED" : "#A78BFA";
    const domainBiblioteca = isLight ? "#059669" : "#10B981";
    const domainFormulas = isLight ? "#E11D48" : "#FB7185";

    // CAMADA D — Cores Semânticas Funcionais e de Estado (Invariáveis)
    const colorSuccess = isLight ? "#059669" : "#10B981";
    const colorWarning = isLight ? "#D97706" : "#F59E0B";
    const colorDanger = isLight ? "#DC2626" : "#EF4444";
    const colorInformation = isLight ? "#0284C7" : "#0EA5E9";
    const colorLocked = "#64748B";
    const colorProGold = isLight ? "#D97706" : "#F59E0B";

    return {
      // Camada A
      "--surface-page": "transparent",
      "--surface-card": surfaceCard,
      "--surface-elevated": surfaceElevated,
      "--text-primary": textPrimary,
      "--text-secondary": textSecondary,
      "--text-muted": textMuted,
      "--border-subtle": borderSubtle,

      // Camada B
      "--accent-primary": accentTokens.accentPrimary,
      "--accent-hover": accentTokens.accentHover,
      "--accent-soft": accentTokens.accentSoft,
      "--accent-border": accentTokens.accentBorder,
      "--accent-text": accentTokens.accentText,
      "--accent-focus-ring": accentTokens.accentFocusRing,
      "--accent-solid-fg": accentTokens.accentSolidFg,
      "--accent-tab-bg": accentTokens.accentTabBg,
      "--accent-tab-fg": accentTokens.accentTabFg,

      // Camada C
      "--domain-caldeiraria": domainCaldeiraria,
      "--domain-caldeiraria-bg": "rgba(245, 158, 11, 0.12)",
      "--domain-caldeiraria-border": "rgba(245, 158, 11, 0.28)",
      "--domain-estruturas": domainEstruturas,
      "--domain-estruturas-bg": "rgba(14, 165, 233, 0.12)",
      "--domain-estruturas-border": "rgba(14, 165, 233, 0.28)",
      "--domain-trilhas": domainTrilhas,
      "--domain-trilhas-bg": "rgba(139, 92, 246, 0.12)",
      "--domain-trilhas-border": "rgba(139, 92, 246, 0.28)",
      "--domain-biblioteca": domainBiblioteca,
      "--domain-biblioteca-bg": "rgba(16, 185, 129, 0.12)",
      "--domain-biblioteca-border": "rgba(16, 185, 129, 0.28)",
      "--domain-formulas": domainFormulas,
      "--domain-formulas-bg": "rgba(225, 29, 72, 0.10)",
      "--domain-formulas-border": "rgba(225, 29, 72, 0.26)",

      // Camada D
      "--color-success": colorSuccess,
      "--color-success-bg": "rgba(16, 185, 129, 0.14)",
      "--color-success-border": "rgba(16, 185, 129, 0.34)",
      "--color-warning": colorWarning,
      "--color-warning-bg": "rgba(245, 158, 11, 0.14)",
      "--color-warning-border": "rgba(245, 158, 11, 0.34)",
      "--color-danger": colorDanger,
      "--color-danger-bg": "rgba(239, 68, 68, 0.14)",
      "--color-danger-border": "rgba(239, 68, 68, 0.40)",
      "--color-information": colorInformation,
      "--color-information-bg": "rgba(14, 165, 233, 0.14)",
      "--color-information-border": "rgba(14, 165, 233, 0.34)",
      "--color-locked": colorLocked,
      "--color-pro-gold": colorProGold,
      "--color-pro-gold-bg": "rgba(245, 158, 11, 0.14)",
      "--color-pro-gold-border": "rgba(245, 158, 11, 0.35)",
    } as React.CSSProperties;
  }, [isLight, isAmoled, effectiveCardOpacityPct, accentTokens]);

  /* =========================================================================
     OBJETOS DE ESTILO DERIVADOS EXCLUSIVAMENTE DOS TOKENS DAS 4 CAMADAS
     ========================================================================= */

  // Camada A: Superfícies e Tipografia
  const titleTextClass = "text-[var(--text-primary)] font-extrabold";
  const bodyStrongClass = "text-[var(--text-primary)]";
  const subtitleTextClass = "text-[var(--text-secondary)]";
  const auxTextClass = "text-[var(--text-muted)]";

  const cardSurfaceStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-card)",
    border: "1px solid var(--border-subtle)",
    boxShadow: isLight
      ? "0 6px 20px rgba(15, 23, 42, 0.05)"
      : isAmoled
        ? "0 8px 24px rgba(0, 0, 0, 0.55)"
        : "0 8px 24px rgba(2, 6, 23, 0.28)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };

  const subCardSurfaceStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
  };

  const inputSurfaceStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
  };

  // Nível 1: Barra das 4 Abas Principais (`Estudo | Trilhas | Biblioteca | Fórmulas`)
  const level1ActiveTabStyle: React.CSSProperties = {
    backgroundColor: "var(--accent-tab-bg)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent-tab-fg)",
    boxShadow: `0 4px 14px rgba(${accentTokens.accentRgb}, 0.20)`,
  };

  // Nível 2: Sub-abas (`Tabelas NBR | Catálogo | Glossário`) — Superfície Neutra de Alto Contraste + Contorno `--accent-border`
  const level2ActiveSubTabStyle: React.CSSProperties = isLight
    ? {
        backgroundColor: "#0F172A",
        border: "1px solid var(--accent-border)",
        color: "#FFFFFF",
      }
    : {
        backgroundColor: "rgba(248, 250, 252, 0.14)",
        border: "1px solid var(--accent-border)",
        color: "#FFFFFF",
      };

  const level2InactiveSubTabStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-secondary)",
  };

  // Nível 3: Chips de Filtro (`Todos (13)`, `Tubos (2)`, `Todas`, `Calandragem`, etc.)
  const level3ActiveChipStyle: React.CSSProperties = {
    backgroundColor: "var(--accent-soft)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent-text)",
  };

  const level3InactiveChipStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-secondary)",
  };

  // Botões Principais de Ação (CTAs)
  const primaryAccentButtonStyle: React.CSSProperties = {
    backgroundColor: "var(--accent-primary)",
    border: "1px solid var(--accent-primary)",
    color: "var(--accent-solid-fg)",
    boxShadow: `0 6px 18px rgba(${accentTokens.accentRgb}, 0.24)`,
  };

  const neutralBubbleStyle: React.CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
  };

  // Camada C: Badges discretos por Domínio Técnico
  const domainCaldeirariaBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--domain-caldeiraria-bg)",
    border: "1px solid var(--domain-caldeiraria-border)",
    color: "var(--domain-caldeiraria)",
  };

  const domainEstruturasBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--domain-estruturas-bg)",
    border: "1px solid var(--domain-estruturas-border)",
    color: "var(--domain-estruturas)",
  };

  const domainTrilhasBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--domain-trilhas-bg)",
    border: "1px solid var(--domain-trilhas-border)",
    color: "var(--domain-trilhas)",
  };

  const domainBibliotecaBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--domain-biblioteca-bg)",
    border: "1px solid var(--domain-biblioteca-border)",
    color: "var(--domain-biblioteca)",
  };

  const domainFormulasBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--domain-formulas-bg)",
    border: "1px solid var(--domain-formulas-border)",
    color: "var(--domain-formulas)",
  };

  // Camada D: Estados Semânticos Invariáveis
  const proGoldBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--color-pro-gold-bg)",
    border: "1px solid var(--color-pro-gold-border)",
    color: "var(--color-pro-gold)",
  };

  const successBadgeStyle: React.CSSProperties = {
    backgroundColor: "var(--color-success-bg)",
    border: "1px solid var(--color-success-border)",
    color: "var(--color-success)",
  };

  const warningBoxStyle: React.CSSProperties = {
    backgroundColor: "var(--color-warning-bg)",
    border: "1px solid var(--color-warning-border)",
    color: "var(--color-warning)",
  };

  const dangerBoxStyle: React.CSSProperties = {
    backgroundColor: "var(--color-danger-bg)",
    border: "1px solid var(--color-danger-border)",
    color: "var(--color-danger)",
  };

  const infoBoxStyle: React.CSSProperties = {
    backgroundColor: "var(--color-information-bg)",
    border: "1px solid var(--color-information-border)",
    color: "var(--color-information)",
  };

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

  // Helper para escolher o badge de domínio (Camada C) para itens do catálogo
  const getCatalogDomainBadgeStyle = (category: string): React.CSSProperties => {
    if (category === "Perfis" || category === "Soldagem") return domainEstruturasBadgeStyle;
    if (category === "Tolerâncias") return domainFormulasBadgeStyle;
    return domainBibliotecaBadgeStyle;
  };

  // Controle de fixação no scroll (Sticky Header Offset em top: 68px abaixo da pílula + PRO)
  const tabBarSentinelRef = useRef<HTMLDivElement | null>(null);
  const [isTabBarPinned, setIsTabBarPinned] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      const el = tabBarSentinelRef.current;
      if (!el) {
        setIsTabBarPinned(window.scrollY > 145);
        return;
      }
      const rect = el.getBoundingClientRect();
      setIsTabBarPinned(rect.top <= 68);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeLessonData]);

  const topScrollShieldStyle: React.CSSProperties = {
    background: isLight
      ? "linear-gradient(to bottom, rgba(234, 238, 243, 0.94) 65%, rgba(234, 238, 243, 0) 100%)"
      : isAmoled
        ? "linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 65%, rgba(0, 0, 0, 0) 100%)"
        : "linear-gradient(to bottom, rgba(11, 13, 17, 0.94) 65%, rgba(11, 13, 17, 0) 100%)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };

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
      <div
        style={academyCssVariables}
        className="w-full min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]"
      >
        <div
          style={topScrollShieldStyle}
          className="fixed top-0 inset-x-0 h-[68px] z-20 pointer-events-none"
        />
        <NavigationAreaContainer className="space-y-4 pb-[calc(135px+env(safe-area-inset-bottom,16px))]">
          <div ref={tabBarSentinelRef} className="h-0 w-full" />
          {isTabBarPinned && <div className="h-[74px] w-full" aria-hidden="true" />}

          {/* Barra Superior do Leitor Imersivo com Offset Seguro (top: 68px abaixo da pílula + PRO) */}
          <div
            className={cn(
              isTabBarPinned
                ? "fixed top-[68px] inset-x-0 z-30 mx-auto w-full max-w-3xl px-5 sm:px-6"
                : "relative z-30",
            )}
          >
            <div
              style={cardSurfaceStyle}
              className="rounded-2xl p-3 sm:p-3.5 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setActiveLessonId(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  style={neutralBubbleStyle}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer",
                    titleTextClass,
                  )}
                >
                  <ChevronLeft className="size-3.5 text-[var(--accent-primary)]" />
                  <span>Voltar</span>
                </button>

                <div className="min-w-0 flex-1 text-center px-2">
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-wider truncate text-[var(--text-secondary)]">
                    <span className="text-[var(--accent-primary)] mr-1">•</span>
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
                  style={isFav ? level3ActiveChipStyle : neutralBubbleStyle}
                  className="grid size-8 place-items-center rounded-xl transition-colors cursor-pointer"
                >
                  <Star
                    className={cn("size-4", !isFav && subtitleTextClass)}
                    style={
                      isFav
                        ? { color: "var(--accent-primary)", fill: "var(--accent-primary)" }
                        : undefined
                    }
                  />
                </button>
              </div>

              {/* Barra de progresso da trilha/currículo */}
              <div
                className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
                style={{
                  backgroundColor: isLight ? "rgba(15, 23, 42, 0.10)" : "rgba(255, 255, 255, 0.12)",
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                    width: `${Math.round(((globalIndex + 1) / totalLessons) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {lessonLocked ? (
            <div style={cardSurfaceStyle} className="rounded-2xl p-6 text-center space-y-3">
              <div
                style={proGoldBadgeStyle}
                className="mx-auto grid size-12 place-items-center rounded-2xl"
              >
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
                  style={primaryAccentButtonStyle}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer"
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
                  <span
                    style={domainCaldeirariaBadgeStyle}
                    className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                  >
                    MÓDULO {module.code} • {module.title}
                  </span>
                  <span className={cn("font-mono text-[10px] flex items-center gap-1", subtitleTextClass)}>
                    <Clock className="size-3 text-[var(--accent-primary)]" />
                    {lesson.minutes} min de leitura
                  </span>
                  {isCompleted && (
                    <span
                      style={successBadgeStyle}
                      className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase flex items-center gap-1"
                    >
                      <CheckCircle2 className="size-3" /> Concluída
                    </span>
                  )}
                </div>

                <h1 className={cn("font-display text-xl sm:text-2xl leading-tight", titleTextClass)}>
                  {lesson.title}
                </h1>

                <div className="space-y-2.5 text-[15px] leading-[1.6]">
                  <p className={cn("font-semibold", bodyStrongClass)}>
                    {activeLessonData.concept}
                  </p>
                  <p className={subtitleTextClass}>{activeLessonData.definition}</p>
                </div>

                {/* Diagrama Técnico Vetorial SVG */}
                <div style={subCardSurfaceStyle} className="rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span className="text-[var(--accent-primary)] mr-1">•</span>
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
                        <div key={idx} style={subCardSurfaceStyle} className="rounded-xl p-3">
                          <p className="font-mono text-sm font-bold text-[var(--accent-text)]">
                            {f.expr}
                          </p>
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
                        style={subCardSurfaceStyle}
                        className="flex items-start gap-2.5 rounded-xl p-3 text-xs sm:text-[13px] leading-relaxed"
                      >
                        <span
                          style={level3ActiveChipStyle}
                          className="grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold"
                        >
                          {i + 1}
                        </span>
                        <span className={bodyStrongClass}>
                          {step.replace(/^\d+\.\s*/, "")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Caixa de Destaque: Dica de Mestre Caldeireiro (Camada D: Warning Semântico) */}
                <div style={warningBoxStyle} className="rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-warning)]">
                    <Lightbulb className="size-3.5 shrink-0" />
                    <span>Dica de Mestre Caldeireiro</span>
                  </div>
                  <p className={cn("text-xs sm:text-[13px] leading-relaxed", bodyStrongClass)}>
                    {activeLessonData.masterTip}
                  </p>
                </div>

                {/* Exemplo Numérico Resolvido (Camada D: Information Semântico) */}
                <div style={infoBoxStyle} className="rounded-xl p-3.5 space-y-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider block text-[var(--color-information)]">
                    Exemplo Numérico Resolvido
                  </span>
                  <p className={cn("font-mono text-xs leading-relaxed", bodyStrongClass)}>
                    {activeLessonData.solvedExample}
                  </p>
                </div>
              </article>

              {/* Checkpoint Rápido de Fixação */}
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-[var(--accent-primary)]" />
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
                        style={
                          isSelected
                            ? isCorrect
                              ? successBadgeStyle
                              : dangerBoxStyle
                            : subCardSurfaceStyle
                        }
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left font-mono text-xs transition-all cursor-pointer",
                          isSelected ? "font-bold" : bodyStrongClass,
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
                  <p
                    style={infoBoxStyle}
                    className="rounded-xl p-3 text-xs font-medium"
                  >
                    {activeLessonData.checkpoint.explanation}
                  </p>
                )}
              </section>

              {/* Barra de Ação no Rodapé do Leitor */}
              <div style={cardSurfaceStyle} className="rounded-2xl p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("success");
                    AudioManager.play("ui_pop");
                    setMastery(lesson.id, isCompleted ? "em-estudo" : "dominado");
                  }}
                  style={isCompleted ? successBadgeStyle : primaryAccentButtonStyle}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-mono text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {isCompleted
                      ? "✓ Lição Concluída — Desfazer"
                      : "Concluir Lição (+Progresso)"}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!prevLesson}
                    onClick={() => prevLesson && openImmersiveLesson(prevLesson.lesson.id)}
                    style={neutralBubbleStyle}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-mono text-[11px] font-bold uppercase transition-opacity cursor-pointer disabled:opacity-35",
                      titleTextClass,
                    )}
                  >
                    <ChevronLeft className="size-3.5 text-[var(--accent-primary)]" />
                    <span>Aula Anterior</span>
                  </button>

                  <button
                    type="button"
                    disabled={!nextLessonItem}
                    onClick={() => nextLessonItem && openImmersiveLesson(nextLessonItem.lesson.id)}
                    style={neutralBubbleStyle}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-mono text-[11px] font-bold uppercase transition-opacity cursor-pointer disabled:opacity-35",
                      titleTextClass,
                    )}
                  >
                    <span>Próxima Aula</span>
                    <ChevronRight className="size-3.5 text-[var(--accent-primary)]" />
                  </button>
                </div>

                {/* Ponte Prática 1:1 (Camada C: Ciano de Engenharia / CAD 3D) */}
                <Link
                  to={activeLessonData.practiceRoute}
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_nav");
                  }}
                  style={domainEstruturasBadgeStyle}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-bold uppercase transition-opacity hover:opacity-90 cursor-pointer"
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
    <div
      style={academyCssVariables}
      className="w-full min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]"
    >
      {/* Escudo superior protetor para a faixa 0..68px quando a página é rolada */}
      {isTabBarPinned && (
        <div
          style={topScrollShieldStyle}
          className="fixed top-0 inset-x-0 h-[68px] z-20 pointer-events-none"
        />
      )}

      <NavigationAreaContainer className="space-y-4 pb-[calc(135px+env(safe-area-inset-bottom,16px))]">
        {/* 1. IDENTIDADE INSTITUCIONAL NO TOPO
            Subtítulo em caixa alta em cinza técnico neutro (--text-secondary),
            ponto luminoso inicial em --accent-primary, e selo PRO CALDRA em Ouro Imperial (--color-pro-gold) */}
        <NavigationAreaHeader
          badgeText="CALDRA ACADEMIA • FORMAÇÃO TÉCNICA EM ESTRUTURAS METÁLICAS, CALDEIRARIA E FABRICAÇÃO"
          badgeColor="text-[var(--text-secondary)]"
          indicatorColor="bg-[var(--accent-primary)]"
          secondaryBadge={
            <span
              style={proGoldBadgeStyle}
              className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase"
            >
              PRO CALDRA
            </span>
          }
          title="Aprenda & Domine"
        />

        {/* Sentinela de scroll + Espaçador quando a barra de 4 abas está fixada em top: 68px */}
        <div ref={tabBarSentinelRef} className="h-0 w-full !mt-0" />
        {isTabBarPinned && <div className="h-[58px] w-full !mt-0" aria-hidden="true" />}

        {/* 2. NAVEGAÇÃO NÍVEL 1 — BARRA DAS 4 ABAS PRINCIPAIS + BUSCA UNIVERSAL (🔍)
            Fixada em top: 68px (abaixo da pílula flutuante + PRO) ao rolar a página */}
        <div
          className={cn(
            isTabBarPinned
              ? "fixed top-[68px] inset-x-0 z-30 mx-auto w-full max-w-3xl px-5 sm:px-6 !mt-0"
              : "relative z-30",
          )}
        >
          <div style={cardSurfaceStyle} className="rounded-2xl p-1.5 transition-all">
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
                  style={isActive ? level1ActiveTabStyle : undefined}
                  className={cn(
                    "flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl py-2 px-1 sm:px-2.5 text-[10.5px] sm:text-xs font-bold tracking-tight transition-all cursor-pointer min-w-0",
                    !isActive && subtitleTextClass,
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}

            {/* Botão Circular de Busca Universal (🔍) */}
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
              style={universalSearchOpen ? level1ActiveTabStyle : neutralBubbleStyle}
              className={cn(
                "grid size-9 place-items-center rounded-xl transition-all cursor-pointer shrink-0",
                !universalSearchOpen && titleTextClass,
              )}
            >
              <Search
                className={cn("size-4", !universalSearchOpen && "text-[var(--accent-primary)]")}
              />
            </button>
          </div>

          {/* Barra de Busca Universal Expansível */}
          {universalSearchOpen && (
            <div
              className="mt-2 pt-2 space-y-3 px-1 pb-1"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div
                style={{
                  ...inputSurfaceStyle,
                  boxShadow: "0 0 0 2px var(--accent-focus-ring)",
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
              >
                <Search className="size-4 shrink-0 text-[var(--accent-primary)]" />
                <input
                  type="text"
                  value={rawSearchQuery}
                  onChange={(e) => setRawSearchQuery(e.target.value)}
                  placeholder="Buscar em 41 lições, fórmulas, MSG 14, NBR 11888, Tubo 4, Fator K..."
                  autoFocus
                  className={cn(
                    "w-full bg-transparent text-xs sm:text-[13px] outline-none",
                    titleTextClass,
                    "font-normal",
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
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--domain-caldeiraria)]">
                            Aulas ({searchResults.lessons.length})
                          </p>
                          {searchResults.lessons.slice(0, 6).map(({ lesson, module }) => (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => openImmersiveLesson(lesson.id)}
                              style={subCardSurfaceStyle}
                              className="flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {lesson.title}
                                </p>
                                <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                                  Módulo {module.code} • {module.title} • {lesson.minutes} min
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.formulas.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--domain-formulas)]">
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
                              style={subCardSurfaceStyle}
                              className="flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {f.code} — {f.name}
                                </p>
                                <p className="font-mono text-[10.5px] font-semibold truncate text-[var(--accent-text)]">
                                  {f.formula}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.tablesAndCatalog.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--domain-biblioteca)]">
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
                              style={subCardSurfaceStyle}
                              className="flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {item.title}
                                </p>
                                <p className={cn("font-mono text-[10px] truncate", subtitleTextClass)}>
                                  {item.subtitle}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.glossary.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--domain-biblioteca)]">
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
                              style={subCardSurfaceStyle}
                              className="flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                                  {g.term}
                                </p>
                                <p className={cn("text-[11px] truncate", subtitleTextClass)}>
                                  {g.summary}
                                </p>
                              </div>
                              <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
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
        </div>

        {/* =====================================================================
            ABA 1: 🎓 ESTUDO (PAINEL DE EVOLUÇÃO, EM ESTUDO AGORA E HISTÓRICO)
            ===================================================================== */}
        {activeTab === "estudo" && (
          <div className="space-y-4">
            {/* 1.1 Passaporte de Domínio Industrial */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-4 transition-all">
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3.5">
                  {/* Anel Circular de Progresso Geral — Usa --accent-primary */}
                  <div className="relative size-14 shrink-0 flex items-center justify-center">
                    <svg className="size-14 -rotate-90" viewBox="0 0 44 44">
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        stroke={isLight ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.12)"}
                        strokeWidth="4"
                      />
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        stroke="var(--accent-primary)"
                        className="transition-all duration-500"
                        strokeWidth="4"
                        strokeDasharray="113.1"
                        strokeDashoffset={113.1 - (progressPct / 100) * 113.1}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute font-mono text-xs font-extrabold text-[var(--accent-primary)]">
                      {progressPct}%
                    </span>
                  </div>

                  <div>
                    {/* Subtítulo em Caixa Alta em cinza técnico neutro (--text-secondary) com ponto luminoso em --accent-primary */}
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <span
                        className="inline-block size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--accent-primary)" }}
                      />
                      <span>Passaporte de Domínio Industrial</span>
                    </span>
                    <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                      {totalCompleted} de {totalLessonsCount} lições concluídas
                    </h2>
                    <p className={cn("text-xs", subtitleTextClass)}>
                      Nível: Traçador & Projetista Industrial
                    </p>
                  </div>
                </div>

                {/* Botão EXPLORAR 5 TRILHAS > */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("trilhas");
                  }}
                  style={neutralBubbleStyle}
                  className={cn(
                    "self-start sm:self-center inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase transition-colors cursor-pointer",
                    titleTextClass,
                  )}
                >
                  <span>Explorar 5 Trilhas</span>
                  <ChevronRight className="size-3.5 text-[var(--accent-primary)]" />
                </button>
              </div>

              {/* As 3 Barras de Proficiência por Área — Cada uma na sua Cor de Identidade de Domínio (Camada C):
                  Barra 1 (Caldeiraria) em Âmbar, Barra 2 (Estruturas) em Ciano, Barra 3 (Matemática & Dobra) em Rubi/Magenta */}
              <div className="grid gap-3 sm:grid-cols-3">
                {domainProficiencies.map((dom, idx) => {
                  const domainColorVar =
                    idx === 0
                      ? "var(--domain-caldeiraria)"
                      : idx === 1
                        ? "var(--domain-estruturas)"
                        : "var(--domain-formulas)";
                  return (
                    <div
                      key={dom.id}
                      style={subCardSurfaceStyle}
                      className="rounded-xl p-3 space-y-1.5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-display text-[11.5px] font-bold leading-snug", bodyStrongClass)}>
                          {dom.label}
                        </span>
                        <span
                          style={{ color: domainColorVar }}
                          className="font-mono text-[10.5px] font-bold shrink-0"
                        >
                          {dom.pct}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full"
                        style={{
                          backgroundColor: isLight
                            ? "rgba(15, 23, 42, 0.10)"
                            : "rgba(255, 255, 255, 0.12)",
                        }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            backgroundColor: domainColorVar,
                            width: `${Math.max(4, dom.pct)}%`,
                          }}
                        />
                      </div>
                      <p className={cn("font-mono text-[9.5px]", auxTextClass)}>
                        {dom.done} de {dom.total} aulas dominadas
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 1.2 Card Protagonista "Em Estudo Agora" */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-4 transition-all">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  style={level3ActiveChipStyle}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                >
                  <Sparkles className="size-3" />
                  EM ANDAMENTO • TRILHA MASTER
                </span>
                <span
                  style={domainCaldeirariaBadgeStyle}
                  className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                >
                  MÓDULO {currentHeroLesson.module.code}
                </span>
                <span
                  style={
                    currentHeroLesson.lesson.free || isProUser
                      ? successBadgeStyle
                      : proGoldBadgeStyle
                  }
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                >
                  <CheckCircle2 className="size-3" />
                  {currentHeroLesson.lesson.free || isProUser ? "Acesso Completo" : "PRO"}
                </span>
                <span className={cn("font-mono text-[10.5px] flex items-center gap-1 ml-auto", subtitleTextClass)}>
                  <Clock className="size-3.5 text-[var(--accent-primary)]" />
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

                  {/* Pilares da Lição (Camada C discreta nos ícones) */}
                  <div className={cn("flex flex-wrap items-center gap-3 text-xs font-mono", subtitleTextClass)}>
                    <span className="inline-flex items-center gap-1.5">
                      <Compass className="size-3.5 text-[var(--domain-caldeiraria)]" />
                      Prática de Traçagem
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Award className="size-3.5 text-[var(--domain-trilhas)]" />
                      Certificação Progressiva
                    </span>
                  </div>

                  {/* Botões de Ação: CTA Primário em --accent-primary, Atalho 3D com ícone Ciano */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openImmersiveLesson(currentHeroLesson.lesson.id)}
                      style={primaryAccentButtonStyle}
                      className="inline-flex items-center gap-2 rounded-xl font-bold text-xs sm:text-sm px-4 py-2.5 active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="size-4 fill-current" />
                      <span>Continuar Lição Agora</span>
                    </button>

                    <Link
                      to="/tracagem"
                      onClick={() => {
                        triggerHaptic("tap");
                        AudioManager.play("ui_nav");
                      }}
                      style={neutralBubbleStyle}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-semibold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer",
                        titleTextClass,
                      )}
                    >
                      <Compass className="size-4 text-[var(--domain-estruturas)]" />
                      <span>Praticar na Oficina / CAD</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("tap");
                        setActiveTab("trilhas");
                        setShowFullCurriculum(true);
                      }}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[var(--accent-text)] hover:underline cursor-pointer px-1 py-1"
                    >
                      <span>Ver Currículo Completo →</span>
                    </button>
                  </div>
                </div>

                {/* Diagrama Técnico Vetorial SVG */}
                <div className="md:col-span-5">
                  <div style={subCardSurfaceStyle} className="rounded-xl p-3.5">
                    <TechnicalConceptSvg diagram="cylinder" isLight={isLight} />
                  </div>
                </div>
              </div>
            </section>

            {/* 1.3 Acesso Rápido: Aulas Recomendadas / Histórico & Atalhos para Tabelas e Fórmulas */}
            <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span
                      className="inline-block size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    />
                    <span>Retomada em 1 Toque</span>
                  </span>
                  <h3 className={cn("font-display text-sm sm:text-base mt-0.5", titleTextClass)}>
                    Estudos Recentes, Favoritos & Consultas Rápidas
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("trilhas")}
                  className="font-mono text-[11px] font-bold text-[var(--accent-text)] hover:underline cursor-pointer"
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
                      style={subCardSurfaceStyle}
                      className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          style={isDone ? successBadgeStyle : domainCaldeirariaBadgeStyle}
                          className="grid size-8 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold"
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
                      <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
                    </button>
                  );
                })}
              </div>

              {/* Atalhos diretos para Biblioteca NBR 11888 (Esmeralda — Camada C) e Simulador de Fórmulas (Rubi — Camada C) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("biblioteca");
                    setLibrarySubTab("tabelas");
                  }}
                  style={subCardSurfaceStyle}
                  className="flex items-center justify-between gap-2.5 rounded-xl p-3 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      style={domainBibliotecaBadgeStyle}
                      className="grid size-8 shrink-0 place-items-center rounded-lg"
                    >
                      <TableProperties className="size-4 shrink-0" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                        Tabelas NBR 11888 & Schedule 40
                      </p>
                      <p className={cn("text-[10.5px] truncate", subtitleTextClass)}>
                        Bitolas MSG, espessuras e calculadora de peso
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveTab("formulas");
                  }}
                  style={subCardSurfaceStyle}
                  className="flex items-center justify-between gap-2.5 rounded-xl p-3 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      style={domainFormulasBadgeStyle}
                      className="grid size-8 shrink-0 place-items-center rounded-lg"
                    >
                      <Calculator className="size-4 shrink-0" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-xs font-bold truncate", titleTextClass)}>
                        Simulador de Fórmulas de Oficina
                      </p>
                      <p className={cn("text-[10.5px] truncate", subtitleTextClass)}>
                        Linha neutra, tronco de cone, Fator K e esquadro
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-[var(--accent-primary)]" />
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
                <div className="flex items-center gap-1.5">
                  <span
                    style={domainCaldeirariaBadgeStyle}
                    className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
                  >
                    01
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    ESCOLA DE ENGENHARIA & CHÃO DE FÁBRICA
                  </span>
                </div>
                <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                  5 Trilhas de Formação Técnica ({totalLessonsCount} Lições)
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setShowFullCurriculum((v) => !v);
                }}
                style={showFullCurriculum ? level3ActiveChipStyle : neutralBubbleStyle}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase transition-colors cursor-pointer",
                  !showFullCurriculum && titleTextClass,
                )}
              >
                <Layers
                  className={cn(
                    "size-3.5",
                    !showFullCurriculum && "text-[var(--domain-trilhas)]",
                  )}
                />
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
                      className="rounded-2xl p-4 space-y-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            style={domainCaldeirariaBadgeStyle}
                            className="inline-block rounded px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase mb-1"
                          >
                            MÓDULO {module.code} • {module.lessons.length} AULAS
                          </span>
                          <h3 className={cn("font-display text-sm sm:text-base", titleTextClass)}>
                            {module.title}
                          </h3>
                          <p className={cn("text-xs mt-0.5", subtitleTextClass)}>
                            {module.summary}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold shrink-0 text-[var(--accent-primary)]">
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
                              style={subCardSurfaceStyle}
                              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isDone ? (
                                  <CheckCircle2 className="size-4 shrink-0 text-[var(--color-success)]" />
                                ) : locked ? (
                                  <Lock className="size-3.5 shrink-0 text-[var(--color-locked)]" />
                                ) : (
                                  <Play className="size-3.5 shrink-0 text-[var(--accent-primary)]" />
                                )}
                                <span className={cn("text-xs font-bold truncate", bodyStrongClass)}>
                                  {lesson.title}
                                </span>
                                {!lesson.free && (
                                  <span
                                    style={proGoldBadgeStyle}
                                    className="rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase shrink-0"
                                  >
                                    PRO
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={cn("font-mono text-[10px]", auxTextClass)}>
                                  {lesson.minutes}m
                                </span>
                                <ChevronRight className="size-3.5 text-[var(--accent-primary)]" />
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
              /* Visualização Estruturada nas 5 Trilhas de Especialização Técnica (Violeta Técnico — Camada C) */
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
                            <span
                              style={domainTrilhasBadgeStyle}
                              className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                            >
                              {track.number}
                            </span>
                            <span
                              style={neutralBubbleStyle}
                              className={cn(
                                "rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold",
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
                              style={
                                prog.status === "Concluída"
                                  ? successBadgeStyle
                                  : prog.status === "Em andamento"
                                    ? level3ActiveChipStyle
                                    : neutralBubbleStyle
                              }
                              className={cn(
                                "rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase",
                                prog.status === "Não iniciada" && "text-[var(--color-locked)]",
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
                              style={neutralBubbleStyle}
                              className={cn(
                                "rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold",
                                bodyStrongClass,
                              )}
                            >
                              {h}
                            </span>
                          ))}
                        </div>

                        {/* Barra de progresso individual da trilha (Violeta Técnico / Accent) */}
                        <div className="w-full space-y-1 pt-0.5">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className={auxTextClass}>
                              {prog.completedLessons} de {prog.totalLessons} lições concluídas
                            </span>
                            <span className="font-bold text-[var(--domain-trilhas)]">
                              {prog.pct}%
                            </span>
                          </div>
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full"
                            style={{
                              backgroundColor: isLight
                                ? "rgba(15, 23, 42, 0.10)"
                                : "rgba(255, 255, 255, 0.12)",
                            }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                backgroundColor: "var(--domain-trilhas)",
                                width: `${Math.max(3, prog.pct)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </button>

                      {/* Módulos e Aulas Internas da Trilha */}
                      {isExpanded && (
                        <div
                          className="px-4 pb-4 pt-3 space-y-3"
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                        >
                          {prog.modules.map((mod) => (
                            <div key={mod.id} className="space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <span className="font-mono text-[10.5px] font-bold uppercase text-[var(--domain-caldeiraria)]">
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
                                      style={subCardSurfaceStyle}
                                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {isDone ? (
                                          <CheckCircle2 className="size-4 shrink-0 text-[var(--color-success)]" />
                                        ) : locked ? (
                                          <Lock className="size-3.5 shrink-0 text-[var(--color-locked)]" />
                                        ) : (
                                          <Play className="size-3.5 shrink-0 text-[var(--accent-primary)]" />
                                        )}
                                        <span className={cn("text-xs font-bold truncate", bodyStrongClass)}>
                                          {lesson.title}
                                        </span>
                                        {!lesson.free && (
                                          <span
                                            style={proGoldBadgeStyle}
                                            className="rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase shrink-0"
                                          >
                                            PRO
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className={cn("font-mono text-[10px]", auxTextClass)}>
                                          {lesson.minutes}m
                                        </span>
                                        <ChevronRight className="size-3.5 text-[var(--accent-primary)]" />
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
            ABA 3: 📚 BIBLIOTECA (TABELAS NBR, CATÁLOGO, GLOSSÁRIO)
            ===================================================================== */}
        {activeTab === "biblioteca" && (
          <div className="space-y-4">
            {/* NAVEGAÇÃO NÍVEL 2 — SUB-ABAS (`Tabelas NBR | Catálogo | Glossário`)
                Superfície Neutra de Alto Contraste (#0F172A no Claro; rgba(248,250,252,0.14) no Escuro)
                + contorno fino --accent-border + micro-indicador de 6px em --accent-primary */}
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
                    style={active ? level2ActiveSubTabStyle : level2InactiveSubTabStyle}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 font-mono text-[9.5px] min-[375px]:text-[11px] sm:text-xs font-bold uppercase transition-all cursor-pointer whitespace-nowrap"
                  >
                    {active && (
                      <span
                        className="inline-block size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--accent-primary)" }}
                      />
                    )}
                    <Icon className="size-3 sm:size-3.5 shrink-0" />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUB-ABA 3.1: 📊 TABELAS NORMATIVAS (4 COLUNAS PROPORCIONAIS SEM CORTE) */}
            {librarySubTab === "tabelas" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-3 sm:p-5 space-y-3.5 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        style={domainBibliotecaBadgeStyle}
                        className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
                      >
                        03
                      </span>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        TABELAS NORMATIVAS DE OFICINA
                      </span>
                    </div>
                    <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                      Consulta Rápida & Calculadora de Chapa
                    </h2>
                  </div>

                  {/* Nível 3: Chips Seletores de Tabela (`NBR 11888 | SCH 40 | DENSIDADE`) */}
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
                          style={active ? level3ActiveChipStyle : level3InactiveChipStyle}
                          className="rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer"
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
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 pb-2"
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <div className="flex items-center gap-2">
                          <h3 className={cn("font-display text-xs sm:text-sm font-bold", titleTextClass)}>
                            {currentTable.title}
                          </h3>
                          <span
                            style={domainBibliotecaBadgeStyle}
                            className="rounded px-2 py-0.5 font-mono text-[9.5px] font-bold"
                          >
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
                          ...subCardSurfaceStyle,
                          display: "grid",
                          gridTemplateColumns: "1.1fr 1fr 0.95fr 1fr",
                          gap: "4px",
                          alignItems: "center",
                        }}
                        className={cn(
                          "px-2 py-2 rounded-lg font-mono text-[9.5px] min-[375px]:text-[10.5px] sm:text-[11px] font-bold uppercase",
                          subtitleTextClass,
                        )}
                      >
                        <span>{currentTable.headers[0]}</span>
                        <span>{currentTable.headers[1]}</span>
                        <span>{currentTable.headers[2]}</span>
                        <span className="text-right">{currentTable.headers[3]}</span>
                      </div>

                      {/* Linhas da Tabela em Grade Proporcional 4 Colunas */}
                      <div
                        className="divide-y"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
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
                            className="w-full px-2 py-2.5 text-left font-mono text-[10px] min-[375px]:text-[11.5px] sm:text-[12px] rounded-lg transition-colors cursor-pointer hover:bg-[var(--surface-elevated)]"
                          >
                            <span className={cn("font-bold whitespace-nowrap", titleTextClass)}>
                              {row.spec}
                            </span>
                            <span className="font-bold whitespace-nowrap text-[var(--domain-biblioteca)]">
                              {row.mm}
                            </span>
                            <span className={cn("whitespace-nowrap", subtitleTextClass)}>
                              {row.pol}
                            </span>
                            <span className={cn("text-right font-semibold whitespace-nowrap", bodyStrongClass)}>
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

            {/* SUB-ABA 3.2: 🗂️ CATÁLOGO & NORMAS */}
            {librarySubTab === "catalogo" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3.5 transition-all">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      style={domainBibliotecaBadgeStyle}
                      className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
                    >
                      04
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      BIBLIOTECA & ACERVO TÉCNICO
                    </span>
                  </div>
                  <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                    Catálogo de Tubos NPS, Perfis, Soldagem & Normas
                  </h2>
                </div>

                {/* NAVEGAÇÃO NÍVEL 3 — Chips de Categoria (`Todos (13)`, `Tubos (2)`, etc.)
                    Chip ativo usa --accent-soft, --accent-border e --accent-text; inativos em --surface-elevated */}
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
                        style={active ? level3ActiveChipStyle : level3InactiveChipStyle}
                        className="rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer"
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
                        style={subCardSurfaceStyle}
                        className="flex flex-col justify-between rounded-xl p-3.5 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {/* Camada C: Identidade discreta por área técnica (Esmeralda para Tubos/Chapas/Normas, Ciano para Perfis/Solda) */}
                              <span
                                style={getCatalogDomainBadgeStyle(item.category)}
                                className="rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase"
                              >
                                {item.category}
                              </span>
                              {item.premium && (
                                <span
                                  style={proGoldBadgeStyle}
                                  className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                                >
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
                                className={cn("size-3.5", !isFav && subtitleTextClass)}
                                style={
                                  isFav
                                    ? {
                                        color: "var(--accent-primary)",
                                        fill: "var(--accent-primary)",
                                      }
                                    : undefined
                                }
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
                          <div
                            className="mt-2.5 pt-2 grid grid-cols-2 gap-2 font-mono text-[11px]"
                            style={{ borderTop: "1px solid var(--border-subtle)" }}
                          >
                            {item.data.slice(0, 2).map((d) => (
                              <div key={d.label} className="min-w-0">
                                <span className={cn("block text-[9px] uppercase truncate", auxTextClass)}>
                                  {d.label}
                                </span>
                                <span className={cn("font-bold truncate block", titleTextClass)}>
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
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                          className="mt-3 pt-2 flex w-full items-center justify-between font-mono text-[10.5px] font-bold uppercase text-[var(--accent-text)] hover:underline cursor-pointer"
                        >
                          <span>
                            {locked ? "Ver Especificação (PRO)" : "Ver Especificação Completa"}
                          </span>
                          <ArrowRight className="size-3.5 text-[var(--accent-primary)]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SUB-ABA 3.3: 📖 GLOSSÁRIO DE OFICINA */}
            {librarySubTab === "glossario" && (
              <section style={cardSurfaceStyle} className="rounded-2xl p-4 sm:p-5 space-y-3 transition-all">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span
                      className="inline-block size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    />
                    <span>DICIONÁRIO TÉCNICO INDUSTRIAL</span>
                  </span>
                  <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                    Glossário de Caldeiraria, Traçagem & Serralheria
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GLOSSARY_ITEMS.map((g) => (
                    <div
                      key={g.id}
                      style={subCardSurfaceStyle}
                      className="rounded-xl p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={cn("font-display text-sm", titleTextClass)}>{g.term}</h3>
                        <span
                          style={domainBibliotecaBadgeStyle}
                          className="rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase"
                        >
                          {g.category}
                        </span>
                      </div>
                      <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                        {g.summary}
                      </p>
                      <p className="pt-1 font-mono text-[10.5px] text-[var(--accent-text)]">
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
                <div className="flex items-center gap-1.5">
                  <span
                    style={domainFormulasBadgeStyle}
                    className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
                  >
                    02
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    RELAÇÕES MATEMÁTICAS & FÓRMULAS DE OFICINA
                  </span>
                </div>
                <h2 className={cn("font-display text-base sm:text-lg mt-0.5", titleTextClass)}>
                  Formulário Interativo com Mini-Simulador ao Vivo
                </h2>
              </div>

              {/* NAVEGAÇÃO NÍVEL 3 — Chips de Agrupamento por Aplicação
                  Chip ativo usa --accent-soft, --accent-border e --accent-text; inativos em --surface-elevated */}
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
                      style={active ? level3ActiveChipStyle : level3InactiveChipStyle}
                      className="rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase transition-all cursor-pointer"
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

                // Validação dimensional semântica (Camada D: --color-danger se algum valor for <= 0)
                const hasInvalidInput = f.inputFields.some(
                  (field) => (currentVals[field.key] ?? 0) <= 0,
                );

                return (
                  <section
                    key={f.id}
                    style={cardSurfaceStyle}
                    className="rounded-2xl p-4 sm:p-5 space-y-3.5 transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Camada C: Rubi / Magenta Técnico para Badges FORM-01..08 */}
                        <span
                          style={domainFormulasBadgeStyle}
                          className="rounded px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase"
                        >
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
                        style={neutralBubbleStyle}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer",
                          titleTextClass,
                        )}
                      >
                        <span>{f.toolLabel}</span>
                        <ArrowRight className="size-3 text-[var(--accent-primary)]" />
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
                      style={subCardSurfaceStyle}
                      className="flex items-center justify-between gap-2 rounded-xl p-3"
                    >
                      <span className="font-mono text-sm sm:text-base font-extrabold tracking-wide text-[var(--accent-text)]">
                        {f.formula}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(f.id, f.formula)}
                        aria-label={`Copiar fórmula ${f.name}`}
                        style={neutralBubbleStyle}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[10px] cursor-pointer",
                          subtitleTextClass,
                        )}
                      >
                        {copiedId === f.id ? (
                          <Check className="size-3.5 text-[var(--color-success)]" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        <span>{copiedId === f.id ? "Copiado" : "Copiar"}</span>
                      </button>
                    </div>

                    {/* Legenda de Variáveis */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {f.variables.map((v) => (
                        <div
                          key={v.sym}
                          style={subCardSurfaceStyle}
                          className="rounded-lg p-2 font-mono"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--domain-formulas)]">
                              {v.sym}
                            </span>
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
                      <strong className="text-[var(--text-primary)]">Exemplo de Oficina:</strong>{" "}
                      {f.exampleSolved}
                    </p>

                    {/* Botão para Abrir/Fechar o Mini-Simulador Interativo (CTA Principal em --accent-primary) */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setExpandedSimulators((prev) => ({ ...prev, [f.id]: !isSimOpen }));
                        }}
                        style={isSimOpen ? primaryAccentButtonStyle : level3ActiveChipStyle}
                        className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold uppercase transition-all cursor-pointer"
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
                        <div style={subCardSurfaceStyle} className="mt-2.5 rounded-xl p-3.5 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {f.inputFields.map((field) => {
                              const fieldVal = currentVals[field.key] ?? 0;
                              const isFieldInvalid = fieldVal <= 0;
                              return (
                                <label key={field.key} className="block space-y-1">
                                  <span
                                    className={cn(
                                      "block font-mono text-[10px] font-bold truncate",
                                      isFieldInvalid
                                        ? "text-[var(--color-danger)]"
                                        : subtitleTextClass,
                                    )}
                                  >
                                    {field.label} {field.unit ? `(${field.unit})` : ""}
                                  </span>
                                  <input
                                    type="number"
                                    step={field.step ?? 1}
                                    min={field.min ?? 0}
                                    value={fieldVal}
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
                                    style={
                                      isFieldInvalid
                                        ? {
                                            ...inputSurfaceStyle,
                                            borderColor: "var(--color-danger)",
                                          }
                                        : inputSurfaceStyle
                                    }
                                    className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-focus-ring)]"
                                  />
                                </label>
                              );
                            })}
                          </div>

                          {hasInvalidInput && (
                            <div
                              style={dangerBoxStyle}
                              className="flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-[11px] font-semibold"
                            >
                              <AlertTriangle className="size-3.5 shrink-0" />
                              <span>
                                Atenção dimensional: insira valores maiores que zero para cálculo
                                válido de oficina.
                              </span>
                            </div>
                          )}

                          {/* Resultado Calculado em Tempo Real */}
                          <div
                            style={hasInvalidInput ? dangerBoxStyle : level3ActiveChipStyle}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3"
                          >
                            <div className="space-y-0.5">
                              <span className="font-mono text-[9.5px] font-bold uppercase block text-[var(--accent-text)]">
                                {result.primaryLabel}
                              </span>
                              <span className={cn("font-mono text-base sm:text-lg font-extrabold", titleTextClass)}>
                                {result.primaryValue}
                              </span>
                            </div>

                            {result.secondaryLabel && result.secondaryValue && (
                              <div className="space-y-0.5 text-right">
                                <span className={cn("font-mono text-[9.5px] uppercase block", subtitleTextClass)}>
                                  {result.secondaryLabel}
                                </span>
                                <span className="font-mono text-sm font-bold text-[var(--accent-text)]">
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
                              style={primaryAccentButtonStyle}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold cursor-pointer"
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
                  <span
                    style={domainBibliotecaBadgeStyle}
                    className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                  >
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
                  style={neutralBubbleStyle}
                  className={cn("p-1.5 rounded-xl cursor-pointer", subtitleTextClass)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div style={subCardSurfaceStyle} className="rounded-xl p-2.5">
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[1]}
                  </span>
                  <span className="font-bold text-[var(--domain-biblioteca)]">
                    {selectedTableRowSheet.row.mm}
                  </span>
                </div>
                <div style={subCardSurfaceStyle} className="rounded-xl p-2.5">
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[2]}
                  </span>
                  <span className={cn("font-bold", titleTextClass)}>
                    {selectedTableRowSheet.row.pol}
                  </span>
                </div>
                <div style={subCardSurfaceStyle} className="rounded-xl p-2.5">
                  <span className={cn("text-[9.5px] uppercase block", auxTextClass)}>
                    {selectedTableRowSheet.table.headers[3]}
                  </span>
                  <span className="font-bold text-[var(--accent-text)]">
                    {selectedTableRowSheet.row.peso}
                  </span>
                </div>
              </div>

              {selectedTableRowSheet.row.notes && (
                <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                  {selectedTableRowSheet.row.notes}
                </p>
              )}

              {/* Calculadora Instantânea de Peso de Chapa (Largura × Comprimento) */}
              {selectedTableRowSheet.row.numericThicknessMm && (
                <div style={subCardSurfaceStyle} className="rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-bold uppercase flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <Calculator className="size-3.5 text-[var(--accent-primary)]" />
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
                        style={inputSurfaceStyle}
                        className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-focus-ring)]"
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
                        style={inputSurfaceStyle}
                        className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-focus-ring)]"
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
                      <div
                        style={level3ActiveChipStyle}
                        className="flex items-center justify-between rounded-xl px-3 py-2.5 font-mono"
                      >
                        <div>
                          <span className="text-[9.5px] uppercase block font-bold text-[var(--text-secondary)]">
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
                          <span className="text-[9.5px] uppercase block font-bold text-[var(--accent-text)]">
                            Peso Real da Chapa
                          </span>
                          <span className="text-base font-extrabold text-[var(--accent-text)]">
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
                  style={primaryAccentButtonStyle}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-mono text-xs font-bold cursor-pointer"
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
                    <span
                      style={getCatalogDomainBadgeStyle(selectedCatalogItemSheet.category)}
                      className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                    >
                      {selectedCatalogItemSheet.category}
                    </span>
                    {selectedCatalogItemSheet.premium && (
                      <span
                        style={proGoldBadgeStyle}
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                      >
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
                  style={neutralBubbleStyle}
                  className={cn("p-1.5 rounded-xl cursor-pointer", subtitleTextClass)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <p className={cn("text-xs leading-relaxed", subtitleTextClass)}>
                {selectedCatalogItemSheet.detail}
              </p>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {selectedCatalogItemSheet.data.map((d) => (
                  <div key={d.label} style={subCardSurfaceStyle} className="rounded-xl p-3">
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
                  style={neutralBubbleStyle}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-mono text-xs font-bold cursor-pointer",
                    titleTextClass,
                  )}
                >
                  {copiedId === "cat-spec" ? (
                    <Check className="size-3.5 text-[var(--color-success)]" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>{copiedId === "cat-spec" ? "Copiado" : "Copiar Dados"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCatalogItemSheet(null)}
                  style={primaryAccentButtonStyle}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-mono text-xs font-bold cursor-pointer"
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
   DIAGRAMA TÉCNICO VETORIAL SVG (VINCULADO AOS TOKENS SEMÂNTICOS E DE DESTAQUE)
   ========================================================================= */

function TechnicalConceptSvg({
  diagram,
  isLight,
}: {
  diagram: "cylinder" | "cone" | "transition" | "elbow" | "sheet" | "bend" | "diagonal" | "chord";
  isLight: boolean;
}) {
  const strokeMain = isLight ? "#0F172A" : "#F8FAFC";
  const strokeAccent = "var(--accent-primary)";
  const strokeMuted = isLight ? "#64748B" : "#94A3B8";
  const fillAccentTint = "var(--accent-soft)";

  if (diagram === "cone") {
    return (
      <svg viewBox="0 0 280 150" className="w-full h-auto" fill="none">
        <polygon
          points="70,125 210,125 175,35 105,35"
          stroke={strokeMain}
          strokeWidth="1.8"
          fill={fillAccentTint}
        />
        <line x1="140" y1="20" x2="140" y2="135" stroke={strokeMuted} strokeDasharray="4 3" />
        <line x1="175" y1="35" x2="175" y2="125" stroke={strokeAccent} strokeDasharray="3 3" />
        <line x1="175" y1="35" x2="210" y2="125" stroke={strokeAccent} strokeWidth="2.5" />
        <text x="198" y="80" fill={strokeAccent} fontSize="10" fontFamily="monospace" fontWeight="bold">
          G = √(H²+(R-r)²)
        </text>
        <text x="144" y="85" fill={strokeAccent} fontSize="9.5" fontFamily="monospace">
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
        <text x="95" y="95" fill={strokeMuted} fontSize="9.5" fontFamily="monospace">
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
          fill={fillAccentTint}
        />
        <line x1="45" y1="125" x2="235" y2="25" stroke={strokeAccent} strokeWidth="2.2" />
        <text x="95" y="72" fill={strokeAccent} fontSize="10" fontFamily="monospace" fontWeight="bold">
          D = √(L² + C²)
        </text>
        <text x="115" y="140" fill={strokeMain} fontSize="9.5" fontFamily="monospace">
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
      <line x1="24" y1="75" x2="112" y2="75" stroke={strokeAccent} strokeWidth="1.5" />
      <text
        x="68"
        y="69"
        textAnchor="middle"
        fill={strokeAccent}
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
        fill={fillAccentTint}
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
