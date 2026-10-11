import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
} from "lucide-react";
import { PART_REGISTRY } from "@/lib/library/registry";
import { listProjects } from "@/lib/lab2d/projects";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

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

/** Peças paramétricas mais utilizadas para atalhos rápidos */
const QUICK_TRACAGEM_PIECES = [
  { slug: "quadrado-redondo", name: "Quadrado → Redondo", tag: "Transição" },
  { slug: "tronco-de-cone", name: "Redução Cônica", tag: "Cônico" },
  { slug: "curva-de-gomos", name: "Curva de Gomos", tag: "Curvas" },
  { slug: "boca-de-lobo", name: "Boca de Lobo", tag: "Interseção" },
  { slug: "cone-excentrico", name: "Cone Excêntrico", tag: "Oblíquo" },
  { slug: "y", name: "Bifurcação em Y", tag: "Derivação" },
];

function ProjetarPage() {
  const navigate = useNavigate();
  const chamferProjects = listProjects();

  return (
    <div className="space-y-4 pb-28 pt-1">
      {/* Cabeçalho da Área */}
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            PROJETO TÉCNICO
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Crie e Calcule
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Desenvolvimento geométrico, ambiente CAD e cálculos para concepção de peças.
        </p>
      </header>

      {/* =========================================================================
          1. TRAÇAGEM (Ordem Visual: 1)
          - Catálogo paramétrico de caldeiraria e tubulações
          - Recursos para desenvolvimento geométrico de peças
          - Acesso aos procedimentos de traçado e planificação
          ========================================================================= */}
      <section aria-labelledby="section-tracagem" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-sky size-11 shadow-inner shrink-0">
              <Compass className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-sky-500">01</span>
                <h2 id="section-tracagem" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Traçagem
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Modelagem paramétrica, traçado passo a passo e planificação de chapas.
              </p>
            </div>
          </div>

          <Link
            to="/tracagem"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 active:scale-95 transition-all"
          >
            <span>Ver todas</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Atalhos rápidos para traçagens mais populares */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_TRACAGEM_PIECES.map((piece) => (
            <Link
              key={piece.slug}
              to="/tracagem/$slug"
              params={{ slug: piece.slug }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-all hover:border-sky-500/40 hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-muted-foreground uppercase">{piece.tag}</span>
                <ArrowRight className="size-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500" />
              </div>
              <span className="mt-1 font-mono text-xs font-semibold text-foreground truncate">
                {piece.name}
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-3 border-t border-border/40 pt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{PART_REGISTRY.length} geometrias paramétricas catalogadas</span>
          <Link to="/tracagem" className="text-sky-500 hover:underline">
            Biblioteca de traçado →
          </Link>
        </div>
      </section>

      {/* =========================================================================
          2. CHAMFER (Ordem Visual: 2)
          - Ambiente CAD 2D existente
          - Criação e edição de desenhos e geometrias
          - Recursos de visualização, modelagem e exportação DXF
          ========================================================================= */}
      <section aria-labelledby="section-chamfer" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-red size-11 shadow-inner shrink-0">
              <PenTool className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-[#FF3B30]">02</span>
                <h2 id="section-chamfer" className="font-display text-base font-bold text-foreground sm:text-lg">
                  CHAMFER
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Prancheta vetorial CAD 2D, edição de geometrias, cotas e exportação DXF.
              </p>
            </div>
          </div>

          <Link
            to="/desenho-2d"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 active:scale-95 transition-all"
          >
            <span>Explorador</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Resumo de desenhos existentes e ação rápida */}
        <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-foreground">
              {chamferProjects.length > 0
                ? `${chamferProjects.length} ${chamferProjects.length === 1 ? "desenho salvo no CAD" : "desenhos salvos no CAD"}`
                : "Nenhum desenho aberto no momento"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {chamferProjects[0]
                ? `Último projeto: ${chamferProjects[0].name}`
                : "Inicie um novo desenho técnico na prancheta vetorial"}
            </p>
          </div>

          <Link
            to="/desenho-2d"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_pop");
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>Abrir CAD CHAMFER</span>
          </Link>
        </div>
      </section>

      {/* =========================================================================
          3. CALCULADORA CIENTÍFICA (Ordem Visual: 3)
          - Calculadora independente acessível sem precisar abrir projeto
          - Operações matemáticas, trigonométricas e conversões
          ========================================================================= */}
      <section aria-labelledby="section-calc" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shadow-inner shrink-0">
              <Calculator className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-amber-500">03</span>
                <h2 id="section-calc" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Calculadora Científica
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Trigonometria (sen, cos, tan), ângulos, raízes e cálculos independentes.
              </p>
            </div>
          </div>

          <Link
            to="/calculadora"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            <span>Tela cheia</span>
            <ExternalLink className="size-3.5" />
          </Link>
        </div>

        {/* Cartão de Acesso Direto Independente */}
        <div className="mt-3.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-semibold text-foreground">
                Cálculos rápidos sem vínculo a projeto
              </p>
              <p className="text-[11px] text-muted-foreground">
                Resolva triângulos, hipotenusas, cordas e arcos imediatamente na oficina.
              </p>
            </div>

            <Link
              to="/calculadora"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 font-mono text-xs font-bold text-zinc-950 shadow-md hover:from-amber-400 hover:to-amber-500 active:scale-95 transition-all"
            >
              <Calculator className="size-4" />
              <span>Abrir Calculadora Científica</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
