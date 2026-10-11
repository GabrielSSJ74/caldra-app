import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  Calculator,
  Compass,
  PenTool,
  ArrowRight,
  ChevronRight,
  Layers,
  Sparkles,
  ExternalLink,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Box,
  FileCode,
  Check,
  Maximize2,
  FolderOpen,
} from "lucide-react";
import { PART_REGISTRY, type PartModel } from "@/lib/library/registry";
import { listProjects as listChamferProjects } from "@/lib/lab2d/projects";
import { useProjects as useDossierProjects } from "@/lib/projects/store";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { VectorPreview } from "@/components/chameleon/VectorPreview";

export const Route = createFileRoute("/projetar")({
  head: () => ({
    meta: [
      { title: "Crie e Calcule — Projetar | CALDRA" },
      {
        name: "description",
        content:
          "Desenvolvimento geométrico de peças, traçagens paramétricas, ambiente CAD CHAMFER e calculadora científica.",
      },
      { property: "og:title", content: "Crie e Calcule — Projetar | CALDRA" },
      {
        property: "og:description",
        content: "Projete traçados, desenhos técnicos e cálculos geométricos de caldeiraria.",
      },
    ],
  }),
  component: ProjetarPage,
});

/* =========================================================================
   1. GRÁFICOS TÉCNICOS ESPECÍFICOS PARA O AMBIENTE DE PROJETO
   ========================================================================= */

/** Gráfico técnico vetorial da Calculadora Científica */
function ScientificCalculatorGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" fill="#0A0B0E" />
      <rect x="24" y="6" width="52" height="58" rx="6" fill="#15171C" stroke="#2D313A" strokeWidth="0.8" />
      {/* Display LCD com expressão e resultado trigonométrico */}
      <rect x="28" y="10" width="44" height="15" rx="2.5" fill="#090B0E" stroke="#1F232B" strokeWidth="0.6" />
      <text x="32" y="16" fill="#94A3B8" fontSize="3.6" fontFamily="monospace">
        tan(30°)·R120
      </text>
      <text x="68" y="21.5" fill="#F59E0B" fontSize="4.6" fontFamily="monospace" fontWeight="bold" textAnchor="end">
        69.282 mm
      </text>
      {/* Teclado matricial de precisão */}
      <g fill="#20242D" stroke="#2D323E" strokeWidth="0.35">
        <rect x="28" y="29" width="9" height="6.5" rx="1.5" />
        <rect x="39" y="29" width="9" height="6.5" rx="1.5" />
        <rect x="50" y="29" width="9" height="6.5" rx="1.5" />
        <rect x="61" y="29" width="11" height="6.5" rx="1.5" fill="#B45309" stroke="#D97706" />

        <rect x="28" y="38" width="9" height="6.5" rx="1.5" />
        <rect x="39" y="38" width="9" height="6.5" rx="1.5" />
        <rect x="50" y="38" width="9" height="6.5" rx="1.5" />
        <rect x="61" y="38" width="11" height="6.5" rx="1.5" fill="#29303D" />

        <rect x="28" y="47" width="9" height="6.5" rx="1.5" />
        <rect x="39" y="47" width="9" height="6.5" rx="1.5" />
        <rect x="50" y="47" width="9" height="6.5" rx="1.5" />
        <rect x="61" y="47" width="11" height="6.5" rx="1.5" fill="#29303D" />

        <rect x="28" y="56" width="9" height="6.5" rx="1.5" />
        <rect x="39" y="56" width="20" height="6.5" rx="1.5" />
        <rect x="61" y="56" width="11" height="6.5" rx="1.5" fill="#F59E0B" stroke="#FBBF24" />
      </g>
      <text x="66.5" y="61" fill="#090B0E" fontSize="4.2" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        =
      </text>
    </svg>
  );
}

/** Gráfico técnico do CHAMFER (Corte de chapa 2D com cotas e chanfros) */
function ChamferDrawingGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" fill="#0B0D12" />
      {/* Grid vetorial técnico */}
      <g stroke="#38BDF8" strokeWidth="0.25" strokeOpacity="0.18">
        <line x1="0" y1="18" x2="100" y2="18" />
        <line x1="0" y1="36" x2="100" y2="36" />
        <line x1="0" y1="54" x2="100" y2="54" />
        <line x1="20" y1="0" x2="20" y2="70" />
        <line x1="50" y1="0" x2="50" y2="70" />
        <line x1="80" y1="0" x2="80" y2="70" />
      </g>
      {/* Geometria com chanfro 45° e cotas de dobra */}
      <path
        d="M 22 18 L 68 18 L 84 34 L 84 56 L 22 56 Z"
        fill="#181B22"
        stroke="#E2E8F0"
        strokeWidth="0.8"
      />
      {/* Linha de dobra pontilhada interna */}
      <line x1="42" y1="18" x2="42" y2="56" stroke="#F59E0B" strokeWidth="0.6" strokeDasharray="2 1.5" />
      <circle cx="32" cy="37" r="4.5" stroke="#38BDF8" strokeWidth="0.7" fill="#0D1117" />
      <circle cx="64" cy="42" r="3.2" stroke="#38BDF8" strokeWidth="0.6" fill="#0D1117" />
      {/* Linha de centro vermelha */}
      <line x1="32" y1="28" x2="32" y2="46" stroke="#EF4444" strokeWidth="0.4" strokeDasharray="3 1 0.8 1" strokeOpacity="0.7" />
      <line x1="23" y1="37" x2="41" y2="37" stroke="#EF4444" strokeWidth="0.4" strokeDasharray="3 1 0.8 1" strokeOpacity="0.7" />
      {/* Cotas técnicas */}
      <g stroke="#94A3B8" strokeWidth="0.5" strokeOpacity="0.8">
        <line x1="22" y1="60" x2="84" y2="60" />
        <line x1="22" y1="58" x2="22" y2="62" />
        <line x1="84" y1="58" x2="84" y2="62" />
      </g>
      <text x="53" y="65" fill="#CBD5E1" fontSize="4.2" fontFamily="monospace" textAnchor="middle">
        120 mm
      </text>
    </svg>
  );
}

/** Gráfico técnico de Traçagem Paramétrica (Geratrizes e planificação com compaço) */
function TracingDraftGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" fill="#080A0E" />
      {/* Blueprint grid */}
      <g stroke="#38BDF8" strokeWidth="0.25" strokeOpacity="0.18">
        <line x1="0" y1="18" x2="100" y2="18" />
        <line x1="0" y1="36" x2="100" y2="36" />
        <line x1="0" y1="54" x2="100" y2="54" />
        <line x1="20" y1="0" x2="20" y2="70" />
        <line x1="50" y1="0" x2="50" y2="70" />
        <line x1="80" y1="0" x2="80" y2="70" />
      </g>
      {/* Arco de planificação do cone */}
      <path d="M 16 54 C 28 26, 72 26, 84 54" stroke="#38BDF8" strokeWidth="1" strokeDasharray="2.5 1.5" />
      <path d="M 30 54 C 38 38, 62 38, 70 54" stroke="#38BDF8" strokeWidth="0.8" />
      {/* Geratrizes cardinais de caldeiraria */}
      <line x1="50" y1="10" x2="16" y2="54" stroke="#F59E0B" strokeWidth="0.5" strokeOpacity="0.75" />
      <line x1="50" y1="10" x2="34" y2="54" stroke="#F59E0B" strokeWidth="0.4" strokeOpacity="0.5" />
      <line x1="50" y1="10" x2="50" y2="54" stroke="#F59E0B" strokeWidth="0.7" strokeOpacity="0.9" />
      <line x1="50" y1="10" x2="66" y2="54" stroke="#F59E0B" strokeWidth="0.4" strokeOpacity="0.5" />
      <line x1="50" y1="10" x2="84" y2="54" stroke="#F59E0B" strokeWidth="0.5" strokeOpacity="0.75" />
      {/* Compasso de traçado técnico */}
      <polygon points="66,28 80,14 84,18 70,32" fill="#475569" stroke="#94A3B8" strokeWidth="0.5" />
      <line x1="66" y1="28" x2="63" y2="31" stroke="#0F172A" strokeWidth="1.2" />
      <circle cx="63" cy="31" r="1.3" fill="#38BDF8" />
    </svg>
  );
}

/* =========================================================================
   2. MODELOS TÉCNICOS EM DESTAQUE PARA O HERO CAD INTERATIVO
   ========================================================================= */

type FeaturedModel = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  norma: string;
  method: string;
  level: string;
  d1: number;
  d2: number;
  h: number;
  e: number;
};

const FEATURED_MODELS: FeaturedModel[] = [
  {
    id: "quadrado-redondo",
    slug: "quadrado-redondo",
    title: "Quadrado → Redondo",
    subtitle: "Transição por triangulação de geratrizes",
    category: "Transições",
    norma: "DIN 2448 / ASME",
    method: "Triangulação",
    level: "Avançado",
    d1: 800,
    d2: 400,
    h: 500,
    e: 0,
  },
  {
    id: "tronco-de-cone",
    slug: "tronco-de-cone",
    title: "Tronco de Cone",
    subtitle: "Redução cônica concêntrica pelo raio verdadeiro",
    category: "Cones",
    norma: "ASME B16.9",
    method: "Radial",
    level: "Intermediário",
    d1: 900,
    d2: 450,
    h: 600,
    e: 0,
  },
  {
    id: "curva-de-gomos",
    slug: "curva-de-gomos",
    title: "Curva de Gomos 90°",
    subtitle: "Cotovelo segmentado para tubulações industriais",
    category: "Curvas",
    norma: "AWWA C208",
    method: "Projeção Cilíndrica",
    level: "Avançado",
    d1: 600,
    d2: 600,
    h: 600,
    e: 0,
  },
  {
    id: "boca-de-lobo",
    slug: "boca-de-lobo",
    title: "Boca de Lobo 90°",
    subtitle: "Interseção ortogonal de tubulações com penetração",
    category: "Interseções",
    norma: "API 5L / ASME B31.3",
    method: "Interseção 3D",
    level: "Avançado",
    d1: 500,
    d2: 350,
    h: 600,
    e: 0,
  },
  {
    id: "cone-excentrico",
    slug: "cone-excentrico",
    title: "Cone Excêntrico",
    subtitle: "Redução plana de fundo para drenos e bombas",
    category: "Cones",
    norma: "DIN EN 10253",
    method: "Radial Oblíquo",
    level: "Avançado",
    d1: 800,
    d2: 400,
    h: 550,
    e: 200,
  },
];

/* =========================================================================
   3. CATEGORIAS DE TRAÇAGEM (CARROSSEL HORIZONTAL)
   ========================================================================= */

const TRACAGEM_CATEGORIES = [
  { id: "todas", label: "Todas as Peças", count: PART_REGISTRY.length },
  { id: "Transições", label: "Transições", count: 8 },
  { id: "Cones", label: "Cones & Reduções", count: 6 },
  { id: "Curvas", label: "Curvas de Gomos", count: 4 },
  { id: "Interseções", label: "Interseções & Tês", count: 7 },
  { id: "Cilíndricas", label: "Cilíndricas & Virolas", count: 5 },
  { id: "Flanges", label: "Flanges & Tampas", count: 6 },
];

/* =========================================================================
   COMPONENTE PRINCIPAL — PROJETAR (CRIE E CALCULE)
   ========================================================================= */

function ProjetarPage() {
  const navigate = useNavigate();

  // Projetos salvos no CHAMFER e no dossiê
  const chamferProjects = useMemo(() => listChamferProjects(), []);
  const dossierProjects = useDossierProjects();

  // Estado do modelo em exibição no Hero CAD
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const activeModel = FEATURED_MODELS[activeModelIndex];

  // Estado da categoria de traçagem selecionada
  const [selectedCategory, setSelectedCategory] = useState("todas");

  // Estado do modo de visualização da viewport 3D
  const [edgeMode, setEdgeMode] = useState<"shaded-edges" | "wireframe">("shaded-edges");
  const [autoRotate, setAutoRotate] = useState(true);
  const [viewNonce, setViewNonce] = useState(0);

  // Construção reativa do modelo 3D matemático
  const wireModel = useMemo(() => {
    return buildWire(activeModel.slug, {
      d1: activeModel.d1,
      d2: activeModel.d2,
      h: activeModel.h,
      e: activeModel.e,
      seg: 48,
      t: 6,
    });
  }, [activeModel]);

  // Lista de peças filtradas pela categoria
  const filteredParts = useMemo(() => {
    if (selectedCategory === "todas") {
      return PART_REGISTRY.slice(0, 10);
    }
    return PART_REGISTRY.filter((p) => p.family === selectedCategory).slice(0, 8);
  }, [selectedCategory]);

  return (
    <div className="relative w-full min-h-screen bg-[#0A0B0E] text-white flex flex-col items-center overflow-x-hidden selection:bg-amber-500/30 selection:text-amber-200">
      {/* Container centralizado com dimensões idênticas à Home */}
      <div className="relative w-full max-w-md space-y-4 px-3 pb-[calc(6rem+env(safe-area-inset-bottom,20px))] pt-1">
        {/* =========================================================================
            A. IDENTIFICADOR DA ÁREA (SEM CABEÇALHO GLOBAL REDUNDANTE)
            - Marca de módulo: "CRIE E CALCULE — PROJETO TÉCNICO"
            - Identidade industrial com LED pulsante âmbar e badge de precisão
            ========================================================================= */}
        <section className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-[0.22em] uppercase text-zinc-400">
                  PROJETO TÉCNICO & CAD
                </span>
                <span className="rounded bg-amber-500/10 px-1 py-0.2 font-mono text-[8px] font-bold text-amber-400 border border-amber-500/30">
                  CALDRA LAB
                </span>
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-zinc-100">
                Crie e Calcule
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
            <Box className="size-3 text-amber-500" />
            <span>{PART_REGISTRY.length} MODELOS</span>
          </div>
        </section>

        {/* =========================================================================
            B. BANNER HERO CAD — AMBIENTE DE CRIAÇÃO E MODELAGEM 3D INTERATIVA
            - Estética profissional CAD / Cinema de Engenharia
            - Viewport 3D em tempo real com controle de órbita e modo de exibição
            - Dados técnicos em tempo real (Norma, Método, Dimensões, Nível)
            - Botão de acesso direto para modelagem e planificação completa
            ========================================================================= */}
        <section
          aria-label="Ambiente CAD em Destaque"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#13151B] to-[#0D0E12] shadow-2xl p-3.5 space-y-3"
        >
          {/* Header do Hero: Seletor de modelo + Badge técnico */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
                <Compass className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold text-amber-400 uppercase">
                    01 • TRAÇAGEM
                  </span>
                  <span className="font-mono text-[8px] text-zinc-400 bg-zinc-800/80 px-1 rounded">
                    {activeModel.norma}
                  </span>
                </div>
                <h2 className="font-display text-sm font-bold text-zinc-100 truncate">
                  {activeModel.title}
                </h2>
              </div>
            </div>

            {/* Ação de alternar modelo em exibição */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_pop");
                  setActiveModelIndex((prev) => (prev + 1) % FEATURED_MODELS.length);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-800/80 px-2 py-1 font-mono text-[9px] font-medium text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
                title="Próximo modelo demonstrativo"
              >
                <span>Alternar</span>
                <ChevronRight className="size-3 text-amber-400" />
              </button>
            </div>
          </div>

          {/* Viewport 3D Principal */}
          <div className="relative h-48 w-full rounded-xl border border-zinc-800/90 bg-gradient-to-b from-[#090B0F] to-[#060709] overflow-hidden">
            {/* Grid blueprint CAD de fundo */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(#38bdf8 0.75px, transparent 0.75px), radial-gradient(#f59e0b 0.5px, transparent 0.5px)",
                backgroundSize: "20px 20px, 40px 40px",
                backgroundPosition: "0 0, 10px 10px",
              }}
            />

            {/* Canvas 3D Paramétrico Real (Interativo com toque / órbita) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Wire3D
                model={wireModel}
                className="size-full"
                interactive={true}
                autoSpin={autoRotate}
                edgeMode={edgeMode}
                viewNonce={viewNonce}
                showRefLines={true}
              />
            </div>

            {/* Overlay com marcações de coordenadas e cotas rápidas */}
            <div className="pointer-events-none absolute top-2 left-2.5 flex flex-col gap-0.5">
              <span className="font-mono text-[8px] font-semibold text-zinc-400 tracking-wider">
                SISTEMA CARTESIANO 3D
              </span>
              <span className="font-mono text-[9px] font-bold text-amber-400">
                D1={activeModel.d1} • D2={activeModel.d2} • H={activeModel.h} mm
              </span>
            </div>

            {/* Controles de visualização sobrepostos na viewport */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/90 rounded-lg p-0.5 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  setAutoRotate((v) => !v);
                }}
                className={cn(
                  "p-1 rounded text-[9px] font-mono transition-all cursor-pointer",
                  autoRotate ? "text-amber-400 bg-amber-500/20" : "text-zinc-400 hover:text-zinc-200",
                )}
                title="Girar automaticamente"
              >
                <RotateCcw className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  setEdgeMode((m) => (m === "shaded-edges" ? "wireframe" : "shaded-edges"));
                }}
                className={cn(
                  "p-1 rounded text-[9px] font-mono transition-all cursor-pointer",
                  edgeMode === "wireframe"
                    ? "text-sky-400 bg-sky-500/20"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
                title="Alternar Sombreamento / Arame"
              >
                <Layers className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setViewNonce((n) => n + 1);
                }}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                title="Resetar câmera"
              >
                <Maximize2 className="size-3" />
              </button>
            </div>
          </div>

          {/* Metadados técnicos do modelo e CTA principal */}
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-900/60 border border-zinc-800/70 p-2">
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">MÉTODO</span>
                <span className="font-mono text-[10px] font-bold text-zinc-200 truncate">
                  {activeModel.method}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">NÍVEL</span>
                <span className="font-mono text-[10px] font-bold text-amber-400">
                  {activeModel.level}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">FABRICAÇÃO</span>
                <span className="font-mono text-[10px] font-bold text-emerald-400">
                  Zero Fresta
                </span>
              </div>
            </div>

            {/* Ações: Abrir na Traçagem Paramétrica + Explorar Biblioteca */}
            <div className="flex items-center gap-2">
              <Link
                to="/tracagem/$slug"
                params={{ slug: activeModel.slug }}
                onClick={() => {
                  triggerHaptic("success");
                  AudioManager.play("ui_action");
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 px-3.5 py-2.5 font-display text-xs font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-600 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Compass className="size-4" strokeWidth={2.2} />
                <span>Traçar Esta Peça Agora</span>
                <ArrowRight className="size-3.5 ml-auto" />
              </Link>

              <Link
                to="/tracagem"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }}
                className="flex items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/80 px-3 py-2.5 font-mono text-xs font-semibold text-zinc-300 hover:bg-zinc-700 active:scale-[0.98] transition-all cursor-pointer"
                title="Ver catálogo completo com todas as traçagens"
              >
                <span>Todas</span>
              </Link>
            </div>
          </div>
        </section>

        {/* =========================================================================
            C. FAÍXA HORIZONTAL DE CATEGORIAS DE TRAÇAGEM (UX TIPO STREAMING)
            ========================================================================= */}
        <section aria-label="Categorias de Traçagem" className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-zinc-200">
                Biblioteca de Traçagem
              </h2>
            </div>
            <Link
              to="/tracagem"
              className="font-mono text-[10px] text-amber-400 hover:underline flex items-center gap-0.5"
            >
              <span>Catálogo ({PART_REGISTRY.length})</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Filtros em pílulas deslizáveis */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {TRACAGEM_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setSelectedCategory(cat.id);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold transition-all cursor-pointer",
                    active
                      ? "bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700",
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Carrossel de Peças da Categoria Selecionada */}
          <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar snap-x">
            {filteredParts.map((part) => (
              <Link
                key={part.id}
                to="/tracagem/$slug"
                params={{ slug: part.engineSlug || "quadrado-redondo" }}
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_pop");
                }}
                className="group relative flex w-36 shrink-0 flex-col rounded-xl border border-zinc-800/90 bg-gradient-to-b from-[#13161C] to-[#0C0E12] p-2 transition-all hover:border-amber-500/50 hover:shadow-lg active:scale-95 snap-start"
              >
                {/* Thumbnail vetorial do modelo */}
                <div className="relative h-20 w-full rounded-lg bg-[#07090D] border border-zinc-800/80 overflow-hidden flex items-center justify-center p-1">
                  <TracingDraftGraphic className="size-full opacity-70 group-hover:opacity-100 transition-opacity" />
                  <span className="absolute bottom-1 right-1 font-mono text-[7px] text-zinc-400 bg-zinc-900/90 px-1 rounded border border-zinc-800">
                    {part.family}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-col min-w-0">
                  <span className="font-display text-[11px] font-bold text-zinc-100 truncate group-hover:text-amber-400 transition-colors">
                    {part.name}
                  </span>
                  <span className="font-mono text-[8px] text-zinc-400 line-clamp-1">
                    {part.summary}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between pt-1 border-t border-zinc-800/70 text-[9px] font-mono text-amber-400">
                  <span>Traçar</span>
                  <ArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* =========================================================================
            D. AMBIENTE CAD 2D — CHAMFER (ORDEM 02)
            - Cartão imersivo com preview de prancheta vetorial
            - Contador dinâmico de desenhos salvos
            - Atalho rápido para novo desenho técnico e explorador de projetos
            ========================================================================= */}
        <section
          aria-labelledby="section-chamfer"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#14151C] to-[#0D0E14] p-3.5 space-y-3 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/40 text-[#FF3B30] shrink-0 shadow-inner">
                <PenTool className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-[#FF3B30]">02</span>
                  <h2 id="section-chamfer" className="font-display text-sm font-bold text-zinc-100">
                    Ambiente CAD CHAMFER
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Prancheta vetorial 2D, cotas, chanfros, offsets e exportação DXF.
                </p>
              </div>
            </div>

            <Link
              to="/desenho-2d"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Explorador</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Banner visual da prancheta CAD */}
          <div className="relative h-28 w-full rounded-xl border border-zinc-800/80 bg-[#090B0E] overflow-hidden flex items-center justify-center">
            <ChamferDrawingGraphic className="size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-300 font-semibold bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800">
                {chamferProjects.length > 0
                  ? `${chamferProjects.length} ${chamferProjects.length === 1 ? "desenho salvo" : "desenhos salvos"}`
                  : "Nenhum desenho aberto"}
              </span>
              <span className="text-red-400 font-semibold">MOTOR VETORIAL ZERO FRESTA</span>
            </div>
          </div>

          {/* Botões de Ação para o CHAMFER */}
          <div className="flex items-center gap-2">
            <Link
              to="/desenho-2d"
              onClick={() => {
                triggerHaptic("success");
                AudioManager.play("ui_pop");
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 font-mono text-xs font-semibold text-red-400 hover:bg-red-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Novo Desenho na Prancheta</span>
            </Link>

            <Link
              to="/desenho-2d"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/80 px-3 py-2 font-mono text-xs font-medium text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
            >
              <FolderOpen className="size-3.5 text-zinc-400" />
              <span>Projetos</span>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            E. CALCULADORA CIENTÍFICA (ORDEM 03)
            - Cartão operacional de cálculo rápido sem vínculo obrigatório a projeto
            - Exibição de trigonometria (sen, cos, tan), hipotenusas e cordas
            - Abertura direta independente
            ========================================================================= */}
        <section
          aria-labelledby="section-calc"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#14151C] to-[#0D0E14] p-3.5 space-y-3 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0 shadow-inner">
                <Calculator className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-amber-500">03</span>
                  <h2 id="section-calc" className="font-display text-sm font-bold text-zinc-100">
                    Calculadora Científica
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Trigonometria, arcos, cordas, ângulos e conversões de caldeiraria.
                </p>
              </div>
            </div>

            <Link
              to="/calculadora"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Tela Cheia</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>

          {/* Gráfico da Calculadora Científica */}
          <div className="relative h-24 w-full rounded-xl border border-zinc-800/80 bg-[#090B0E] overflow-hidden flex items-center justify-center">
            <ScientificCalculatorGraphic className="size-full" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/70 pointer-events-none" />
            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-300 font-semibold bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800">
                sen • cos • tan • √ • π
              </span>
              <span className="text-amber-400 font-semibold">CÁLCULO INDEPENDENTE</span>
            </div>
          </div>

          {/* Botão de Ação Direta da Calculadora */}
          <Link
            to="/calculadora"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_pop");
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 font-mono text-xs font-bold text-zinc-950 shadow-md hover:from-amber-400 hover:to-amber-500 active:scale-95 transition-all cursor-pointer"
          >
            <Calculator className="size-4" strokeWidth={2.2} />
            <span>Abrir Calculadora Científica</span>
          </Link>
        </section>

        {/* Rodapé informativo sutil de conformidade técnica */}
        <footer className="pt-2 pb-1 text-center font-mono text-[9px] text-zinc-500">
          CALDRA Metal Lab Suite • Precisão Sub-Milimétrica • Offline-First
        </footer>
      </div>
    </div>
  );
}
