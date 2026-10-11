import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  FolderKanban,
  FileText,
  Wrench,
  Plus,
  ChevronRight,
  TrendingUp,
  Grid2x2,
  Wallet,
  Receipt,
  QrCode,
  Layers,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  useProjects,
  createProject,
  type NewProjectInput,
  PROJECT_STATUS_LABEL,
} from "@/lib/projects/store";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/produzir")({
  head: () => ({
    meta: [
      { title: "Orce e Fabrique — Produzir | CALDRA" },
      {
        name: "description",
        content:
          "Gestão de projetos de fabricação, documentação técnica, gabaritos, orçamentos e ferramentas de oficina metálica.",
      },
      { property: "og:title", content: "Orce e Fabrique — Produzir | CALDRA" },
      {
        property: "og:description",
        content: "Organize projetos, emita documentação de corte e execute na oficina com precisão.",
      },
    ],
  }),
  component: ProduzirPage,
});

function ProduzirPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const handleCreateProject = (input: NewProjectInput) => {
    try {
      const created = createProject(input);
      setNewProjectOpen(false);
      triggerHaptic("success");
      AudioManager.play("ui_pop");
      void navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
    } catch (e) {
      console.error("Falha ao criar projeto:", e);
    }
  };

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);

  return (
    <div className="space-y-4 pb-28 pt-1">
      {/* Cabeçalho da Área */}
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            PRODUÇÃO & OFICINA
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Orce e Fabrique
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Organização de projetos, documentação de execução e atividades de oficina.
        </p>
      </header>

      {/* =========================================================================
          1. PROJETOS (Ordem Visual: 1)
          - Lista de projetos existentes
          - Acesso aos projetos salvos
          - Criação de novos projetos pelos mecanismos existentes
          ========================================================================= */}
      <section aria-labelledby="section-projetos" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-sky size-11 shadow-inner shrink-0">
              <FolderKanban className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-sky-500">01</span>
                <h2 id="section-projetos" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Projetos
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Dossiês e pacotes de fabricação: peças, materiais e entrega.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_pop");
                setNewProjectOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="size-3" />
              <span>Novo</span>
            </button>
            <Link
              to="/projetos"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            >
              <span>Ver todos</span>
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Lista compacta de projetos existentes */}
        <div className="mt-3.5 space-y-2">
          {recentProjects.length > 0 ? (
            recentProjects.map((p) => (
              <Link
                key={p.id}
                to="/projetos/$projectId"
                params={{ projectId: p.id }}
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_nav");
                }}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 sm:p-3 transition-all hover:border-sky-500/40 hover:bg-muted/40 active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs sm:text-sm font-semibold text-foreground truncate">
                      {p.name}
                    </span>
                    <span className="font-mono text-[9px] rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                      {PROJECT_STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {p.client ? `Cliente: ${p.client}` : "Sem cliente definido"} • {p.parts.length} {p.parts.length === 1 ? "peça" : "peças"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500" />
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
              <p className="text-xs text-muted-foreground">Nenhum projeto cadastrado no momento.</p>
              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-sky-500 hover:underline cursor-pointer"
              >
                <Plus className="size-3.5" />
                Criar primeiro projeto
              </button>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          2. DESENHOS TÉCNICOS E GABARITOS (Ordem Visual: 2)
          - Gabaritos de traçado e apoio à execução
          - Ficha de produção com QR code e documentação técnica
          ========================================================================= */}
      <section aria-labelledby="section-gabaritos" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shadow-inner shrink-0">
              <FileText className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-amber-500">02</span>
                <h2 id="section-gabaritos" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Desenhos Técnicos e Gabaritos
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Documentação de execução, pranchas em PDF, gabaritos e fichas de bancada.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Link
            to="/oficina"
            search={{ tab: "ficha" }}
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="group flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-all hover:border-amber-500/40 hover:bg-muted/40 active:scale-[0.99]"
          >
            <div className="caldra-bubble-base caldra-bubble-amber size-9 shrink-0">
              <QrCode className="size-4.5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-xs sm:text-sm font-semibold text-foreground">
                Ficha de Produção (QR)
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Rastreabilidade de corte, dobras e montagem para chão de fábrica.
              </p>
            </div>
          </Link>

          <Link
            to="/desenho-2d"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="group flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-all hover:border-amber-500/40 hover:bg-muted/40 active:scale-[0.99]"
          >
            <div className="caldra-bubble-base caldra-bubble-red size-9 shrink-0">
              <Layers className="size-4.5 text-[#FF3B30]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-xs sm:text-sm font-semibold text-foreground">
                Pranchas e Gabaritos CAD
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Exportação de contornos e arquivos DXF/SVG para mesa de corte.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* =========================================================================
          3. OFICINA (Ordem Visual: 3)
          - Ferramentas de oficina existentes
          - Consumo de chapa, desperdício, nesting, custos e orçamentos
          ========================================================================= */}
      <section aria-labelledby="section-oficina" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-emerald size-11 shadow-inner shrink-0">
              <Wrench className="size-5.5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-emerald-500">03</span>
                <h2 id="section-oficina" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Oficina
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Nesting de chapa, cálculo de consumo, custos de máquina e orçamentos.
              </p>
            </div>
          </div>

          <Link
            to="/oficina"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all"
          >
            <span>Abrir oficina</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Módulos especializados de oficina */}
        <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Link
            to="/oficina"
            search={{ tab: "chapa" }}
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_pop");
            }}
            className="group flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-muted/40 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <Grid2x2 className="size-4 text-emerald-500" />
              <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-xs font-semibold text-foreground block">
                Chapa & Nesting
              </span>
              <span className="text-[10px] text-muted-foreground">
                Aproveitamento de retalho e corte
              </span>
            </div>
          </Link>

          <Link
            to="/oficina"
            search={{ tab: "custo" }}
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_pop");
            }}
            className="group flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-muted/40 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <Wallet className="size-4 text-indigo-500" />
              <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-xs font-semibold text-foreground block">
                Custos de Fabricação
              </span>
              <span className="text-[10px] text-muted-foreground">
                Tarifas de corte, dobra e solda
              </span>
            </div>
          </Link>

          <Link
            to="/oficina"
            search={{ tab: "orcamento" }}
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_pop");
            }}
            className="group flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-muted/40 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <Receipt className="size-4 text-amber-500" />
              <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-xs font-semibold text-foreground block">
                Orçamentos Comerciais
              </span>
              <span className="text-[10px] text-muted-foreground">
                Margem de venda e proposta PDF
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Diálogo de Criação de Projeto */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
