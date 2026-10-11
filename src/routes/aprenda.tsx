import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  GraduationCap,
  BookOpen,
  Binary,
  TableProperties,
  Library,
  ChevronRight,
  ArrowRight,
  Calculator,
  Compass,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useAcademy, nextLesson, COMPETENCY_MAP, competencyLevel } from "@/lib/education/progress";
import { LIBRARY_CATEGORIES, LIBRARY_ITEMS } from "@/lib/library/catalog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aprenda")({
  head: () => ({
    meta: [
      { title: "Aprimore — Aprenda | CALDRA" },
      {
        name: "description",
        content:
          "Formação em caldeiraria, fundamentos de traçagem, fórmulas matemáticas aplicadas, tabelas técnicas e biblioteca.",
      },
      { property: "og:title", content: "Aprimore — Aprenda | CALDRA" },
      {
        property: "og:description",
        content: "Estudos, fórmulas de caldeiraria, tabelas normativas e biblioteca técnica.",
      },
    ],
  }),
  component: AprendaPage,
});

/** Fórmulas essenciais de caldeiraria com explicação e atalho de aplicação */
const TECHNICAL_FORMULAS = [
  {
    id: "circunferencia-neutra",
    name: "Comprimento da Fibra Neutra",
    category: "Calandragem & Rolos",
    formula: "C = π × (De - e)",
    description: "Cálculo do corte da chapa considerando o diâmetro médio. Evita folgas ou aperto na junta soldada.",
    practicalTool: "/tracagem/cilindro",
    toolLabel: "Aplicar na Traçagem de Cilindro",
  },
  {
    id: "desenvolvimento-conico",
    name: "Ângulo do Leque Cônico",
    category: "Transição Cônica",
    formula: "θ = 360° × (R / G)",
    description: "Determina o ângulo de abertura da chapa planificada de cones e reduções concêntricas.",
    practicalTool: "/tracagem/tronco-de-cone",
    toolLabel: "Aplicar no Tronco de Cone",
  },
  {
    id: "triangulacao",
    name: "Geratriz por Triangulação",
    category: "Quadrado para Redondo",
    formula: "L = √(Δx² + Δy² + H²)",
    description: "Hipotenusa no espaço tridimensional usada para traçar transições de seção retangular para circular.",
    practicalTool: "/tracagem/quadrado-redondo",
    toolLabel: "Aplicar no Quadrado → Redondo",
  },
  {
    id: "curva-gomos",
    name: "Ângulo por Gomo em Curvas",
    category: "Segmentos Angulares",
    formula: "α = Ângulo Total / (2 × (N - 1))",
    description: "Ângulo dos meios-gomos de ponta e dos gomos centrais inteiros em curvas de gomos de tubulação.",
    practicalTool: "/tracagem/curva-de-gomos",
    toolLabel: "Aplicar na Curva de Gomos",
  },
  {
    id: "massa-chapa",
    name: "Massa da Chapa Metálica",
    category: "Engenharia de Custos",
    formula: "M = Área (m²) × Espessura (mm) × 7,85",
    description: "Determina o peso em kg de uma chapa de aço carbono comercial a partir das medidas e densidade.",
    practicalTool: "/calculadora",
    toolLabel: "Calcular na Calculadora",
  },
];

/** Tabelas técnicas essenciais para chão de fábrica */
const SHOP_FLOOR_TABLES = [
  {
    title: "Bitolas de Chapa (MSG / mm)",
    badge: "Chapa Comercial",
    data: [
      { spec: "MSG 16", mm: "1,50 mm", pol: '1/16"' },
      { spec: "MSG 14", mm: "1,90 mm", pol: '5/64"' },
      { spec: "MSG 12", mm: "2,65 mm", pol: '7/64"' },
      { spec: "MSG 1/8", mm: "3,18 mm", pol: '1/8"' },
      { spec: "MSG 3/16", mm: "4,75 mm", pol: '3/16"' },
      { spec: "MSG 1/4", mm: "6,35 mm", pol: '1/4"' },
    ],
  },
  {
    title: "Tubos Schedule 40 (ASTM A53)",
    badge: "Tubulações",
    data: [
      { spec: '2" (50 mm)', mm: "Parede 3,91 mm", pol: "DE 60,3 mm" },
      { spec: '3" (75 mm)', mm: "Parede 5,49 mm", pol: "DE 88,9 mm" },
      { spec: '4" (100 mm)', mm: "Parede 6,02 mm", pol: "DE 114,3 mm" },
      { spec: '6" (150 mm)', mm: "Parede 7,11 mm", pol: "DE 168,3 mm" },
      { spec: '8" (200 mm)', mm: "Parede 8,18 mm", pol: "DE 219,1 mm" },
      { spec: '10" (250 mm)', mm: "Parede 9,27 mm", pol: "DE 273,0 mm" },
    ],
  },
  {
    title: "Densidade de Metais (kg/dm³)",
    badge: "Materiais",
    data: [
      { spec: "Aço Carbono", mm: "7,85 kg/dm³", pol: "Padrão Industrial" },
      { spec: "Aço Inox 304/316", mm: "8,00 kg/dm³", pol: "Alta Resistência" },
      { spec: "Alumínio", mm: "2,70 kg/dm³", pol: "Leve" },
      { spec: "Cobre", mm: "8,96 kg/dm³", pol: "Condutor" },
      { spec: "Latão", mm: "8,50 kg/dm³", pol: "Liga Cu-Zn" },
      { spec: "Titânio", mm: "4,51 kg/dm³", pol: "Aeroespacial" },
    ],
  },
];

function AprendaPage() {
  const academyState = useAcademy();
  const next = nextLesson(academyState);
  const [selectedFormula, setSelectedFormula] = useState<string | null>(null);

  return (
    <div className="space-y-4 pb-28 pt-1">
      {/* Cabeçalho da Área */}
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            CONHECIMENTO & CONSULTA
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Aprimore
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Fundamentos técnicos, fórmulas aplicadas, tabelas normativas e biblioteca.
        </p>
      </header>

      {/* =========================================================================
          1. ESTUDOS (Ordem Visual: 1)
          - Escola de caldeiraria e traçagem
          - Trilha de aprendizagem, mapa de competências e aulas
          ========================================================================= */}
      <section aria-labelledby="section-estudos" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shadow-inner shrink-0">
              <GraduationCap className="size-5.5 text-amber-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-amber-500">01</span>
                <h2 id="section-estudos" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Estudos
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Trilha de formação em caldeiraria: fundamentos, trigonometria e planificação.
              </p>
            </div>
          </div>

          <Link
            to="/escola"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            <span>Escola CALDRA</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Card de continuação de estudos */}
        <div className="mt-3.5 rounded-xl border border-border/60 bg-muted/20 p-3">
          {next ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="min-w-0">
                <span className="font-mono text-[9px] uppercase tracking-wider text-amber-500 font-semibold block">
                  Continuar Trilha • {next.module.code}
                </span>
                <p className="font-display text-xs sm:text-sm font-semibold text-foreground truncate mt-0.5">
                  {next.lesson.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {next.module.title} • {next.lesson.minutes} min de conteúdo
                </p>
              </div>

              <Link
                to="/escola/aula/$lessonId"
                params={{ lessonId: next.lesson.id }}
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_pop");
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <span>Acessar lição</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-foreground">
                  Diagnóstico e mapa de competências
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Avalie seus conhecimentos em geometria, trigonometria e traçado.
                </p>
              </div>
              <Link
                to="/escola/diagnostico"
                className="font-mono text-xs font-semibold text-amber-500 hover:underline"
              >
                Iniciar teste →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          2. FÓRMULAS (Ordem Visual: 2)
          - Relações matemáticas aplicadas
          - Explicações conceituais e atalhos para ferramentas correspondentes
          ========================================================================= */}
      <section aria-labelledby="section-formulas" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-red size-11 shadow-inner shrink-0">
              <Binary className="size-5.5 text-[#FF3B30]" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-[#FF3B30]">02</span>
                <h2 id="section-formulas" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Fórmulas
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Relações matemáticas da caldeiraria e traçagem com atalho para aplicação prática.
              </p>
            </div>
          </div>
        </div>

        {/* Lista de fórmulas técnicas */}
        <div className="mt-3.5 space-y-2">
          {TECHNICAL_FORMULAS.map((f) => {
            const isExpanded = selectedFormula === f.id;
            return (
              <div
                key={f.id}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:border-red-500/30"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedFormula(isExpanded ? null : f.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedFormula(isExpanded ? null : f.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {f.category}
                    </span>
                    <h3 className="font-display text-xs sm:text-sm font-semibold text-foreground">
                      {f.name}
                    </h3>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#FF3B30] bg-red-500/10 px-2 py-0.5 rounded-md shrink-0">
                    {f.formula}
                  </span>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground leading-normal">
                  {f.description}
                </p>

                {/* Atalho de aplicação prática sem duplicar cálculos */}
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
                  <span className="font-mono text-[9px] text-muted-foreground">
                    Aplicação na oficina:
                  </span>
                  <Link
                    to={f.practicalTool}
                    onClick={() => {
                      triggerHaptic("tap");
                      AudioManager.play("ui_nav");
                    }}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#FF3B30] hover:underline"
                  >
                    <span>{f.toolLabel}</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          3. TABELAS (Ordem Visual: 3)
          - Tabelas técnicas de consulta rápida
          - Espessuras de chapa, tubos Schedule e densidades
          ========================================================================= */}
      <section aria-labelledby="section-tabelas" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-sky size-11 shadow-inner shrink-0">
              <TableProperties className="size-5.5 text-sky-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-sky-500">03</span>
                <h2 id="section-tabelas" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Tabelas
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Valores de consulta técnica, bitolas normativas e referências industriais.
              </p>
            </div>
          </div>
        </div>

        {/* Tabelas de consulta rápida */}
        <div className="mt-3.5 space-y-3">
          {SHOP_FLOOR_TABLES.map((table) => (
            <div key={table.title} className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <h3 className="font-display text-xs sm:text-sm font-semibold text-foreground">
                  {table.title}
                </h3>
                <span className="font-mono text-[9px] rounded-md bg-muted px-1.5 py-0.5 text-sky-500 font-semibold">
                  {table.badge}
                </span>
              </div>
              <div className="mt-2 divide-y divide-border/30">
                {table.data.map((row) => (
                  <div key={row.spec} className="flex items-center justify-between py-1 text-xs">
                    <span className="font-mono text-muted-foreground">{row.spec}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{row.mm}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/75">({row.pol})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          4. BIBLIOTECA (Ordem Visual: 4)
          - Materiais de consulta, perfis, tubos e normas
          - Acesso aos recursos documentais já implementados
          ========================================================================= */}
      <section aria-labelledby="section-biblioteca" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-emerald size-11 shadow-inner shrink-0">
              <Library className="size-5.5 text-emerald-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-emerald-500">04</span>
                <h2 id="section-biblioteca" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Biblioteca
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Normas técnicas, tabelas completas de perfis estruturais e tubulações.
              </p>
            </div>
          </div>

          <Link
            to="/biblioteca"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all"
          >
            <span>Consultar</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-3.5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
          <div>
            <span className="font-mono text-xs font-semibold text-foreground block">
              {LIBRARY_ITEMS.length} itens catalogados
            </span>
            <span className="text-[11px] text-muted-foreground">
              Tubulações, chapas, perfis I/W, soldagem e conversões normativas.
            </span>
          </div>

          <Link
            to="/biblioteca"
            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-500 hover:underline shrink-0"
          >
            <span>Abrir catálogo</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
