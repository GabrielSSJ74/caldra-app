import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Calculator,
  Compass,
  FolderKanban,
  GraduationCap,
  Home,
  LayoutGrid,
  Library,
  PenTool,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  User,
  Wrench,
  Layers,
  ChevronRight,
} from "lucide-react";
import { CaldraLogo } from "@/components/caldra/Logo";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { useShellActions } from "./ShellActions";
import { createProject, type NewProjectInput } from "@/lib/projects/store";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const isHome = pathname === "/";
  const isProjects = pathname.startsWith("/projetos");
  const isBudgets = pathname.startsWith("/oficina");
  const isMore = [
    "/configuracoes",
    "/biblioteca",
    "/escola",
    "/calculadora",
    "/desenho-2d",
    "/pro",
    "/conta",
  ].some((r) => pathname.startsWith(r));

  const handleCreateProject = (input: NewProjectInput) => {
    try {
      const created = createProject(input);
      setNewProjectOpen(false);
      triggerHaptic("success");
      AudioManager.play("ui_pop");
      void navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
    } catch (e) {
      console.error("Erro ao criar projeto:", e);
    }
  };

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+6px)] px-3 pointer-events-none select-none"
      >
        <div className="caldra-dock pointer-events-auto flex w-full max-w-md items-center justify-between rounded-3xl px-2 py-1.5">
          {/* 1. INÍCIO */}
          <Link
            to="/"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Início"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isHome
                ? "text-amber-500 dark:text-amber-400 font-bold"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <Home className="size-5" />
            <span className="font-mono text-[10px] tracking-tight">Início</span>
          </Link>

          {/* 2. PROJETOS */}
          <Link
            to="/projetos"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Projetos"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isProjects
                ? "text-amber-500 dark:text-amber-400 font-bold"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <FolderKanban className="size-5" />
            <span className="font-mono text-[10px] tracking-tight">Projetos</span>
          </Link>

          {/* 3. BOTÃO CENTRAL CALDRA (Ação global de criação rápida) */}
          <div className="flex flex-1 items-center justify-center -my-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
                setQuickOpen(true);
              }}
              aria-label="Menu de ações rápidas CALDRA"
              className="group relative flex size-13 items-center justify-center rounded-full border-2 border-amber-500 bg-card dark:bg-[#16181D] shadow-lg shadow-amber-500/25 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer touch-manipulation"
            >
              <CaldraLogo size={28} glow />
              {/* Anel de brilho sutil */}
              <span className="pointer-events-none absolute inset-0 rounded-full border border-amber-400/40 opacity-40 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* 4. ORÇAMENTOS */}
          <Link
            to="/oficina"
            search={{ tab: "orcamento" }}
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Orçamentos"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isBudgets
                ? "text-amber-500 dark:text-amber-400 font-bold"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <TrendingUp className="size-5" />
            <span className="font-mono text-[10px] tracking-tight">Orçamentos</span>
          </Link>

          {/* 5. MAIS */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
              setMoreOpen(true);
            }}
            aria-label="Mais opções"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              moreOpen || isMore
                ? "text-amber-500 dark:text-amber-400 font-bold"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <LayoutGrid className="size-5" />
            <span className="font-mono text-[10px] tracking-tight">Mais</span>
          </button>
        </div>
      </nav>

      {/* Sheet de Ações Rápidas do Botão Central CALDRA */}
      <QuickActionsModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onNewProject={() => {
          setQuickOpen(false);
          setNewProjectOpen(true);
        }}
        onNewBudget={() => {
          setQuickOpen(false);
          void navigate({ to: "/oficina", search: { tab: "orcamento" } });
        }}
        onOpenTools={() => {
          setQuickOpen(false);
          setToolsOpen(true);
        }}
      />

      {/* Sheet "Mais" com módulos complementares */}
      <MoreOptionsModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpenTools={() => {
          setMoreOpen(false);
          setToolsOpen(true);
        }}
      />

      {/* Modal de Criação de Projeto Operacional */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />

      {/* Bancada de Ferramentas Técnicas */}
      <NavToolsModal open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  );
}

/** Menu de Ações Rápidas acionado pelo botão central CALDRA */
function QuickActionsModal({
  open,
  onClose,
  onNewProject,
  onNewBudget,
  onOpenTools,
}: {
  open: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onNewBudget: () => void;
  onOpenTools: () => void;
}) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[min(90vw,440px)] border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <CaldraLogo size={28} />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Criação Rápida
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Ações operacionais da sua oficina digital CALDRA.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            onClick={onNewProject}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-muted/30 p-3.5 text-left transition-all hover:border-red-500/40 hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
          >
            <div className="caldra-bubble-base caldra-bubble-red size-11 shrink-0">
              <Plus className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Novo projeto</h4>
              <p className="text-xs text-muted-foreground">Inicie um novo trabalho ou pacote CAD</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onNewBudget}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-muted/30 p-3.5 text-left transition-all hover:border-emerald-500/40 hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
          >
            <div className="caldra-bubble-base caldra-bubble-emerald size-11 shrink-0">
              <Receipt className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Novo orçamento</h4>
              <p className="text-xs text-muted-foreground">Calcule custos de chapa, corte e proposta</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenTools}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-muted/30 p-3.5 text-left transition-all hover:border-amber-500/40 hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
          >
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shrink-0">
              <Wrench className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Abrir ferramentas</h4>
              <p className="text-xs text-muted-foreground">Calculadoras, traçagem 3D e prancheta CAD</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Menu secundário de opções "Mais" */
function MoreOptionsModal({
  open,
  onClose,
  onOpenTools,
}: {
  open: boolean;
  onClose: () => void;
  onOpenTools: () => void;
}) {
  const navigate = useNavigate();
  const { openProfile, openMaster } = useShellActions();

  if (!open) return null;

  const items = [
    {
      title: "Ferramentas",
      desc: "Bancada técnica",
      icon: Wrench,
      action: onOpenTools,
    },
    {
      title: "Especialização",
      desc: "Caldeiraria e traçagem",
      icon: GraduationCap,
      to: "/escola",
    },
    {
      title: "Estudos",
      desc: "Aulas e fórmulas",
      icon: BookOpen,
      to: "/escola",
    },
    {
      title: "Biblioteca técnica",
      desc: "Tubos, chapas e perfis",
      icon: Library,
      to: "/biblioteca",
    },
    {
      title: "Perfil e conta",
      desc: "Identificação e dados",
      icon: User,
      action: () => {
        onClose();
        openProfile();
      },
    },
    {
      title: "Configurações",
      desc: "Preferências e idioma",
      icon: Settings,
      to: "/configuracoes",
    },
    {
      title: "CALDRA Pro",
      desc: "Planos e assinatura",
      icon: Sparkles,
      to: "/pro",
    },
    {
      title: "Modo Mestre",
      desc: "Recursos avançados",
      icon: Sparkles,
      action: () => {
        onClose();
        openMaster();
      },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,500px)] overflow-y-auto border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <LayoutGrid className="size-4.5 text-amber-500" />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Mais Recursos
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Acesse ferramentas especializadas, configurações e recursos da plataforma.
          </p>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {items.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                if (item.action) {
                  item.action();
                } else if (item.to) {
                  onClose();
                  void navigate({ to: item.to });
                }
              }}
              className="flex flex-col items-start rounded-2xl border border-border/60 bg-muted/30 p-3 text-left transition-all hover:border-border hover:bg-muted/60 active:scale-[0.98] cursor-pointer touch-manipulation"
            >
              <item.icon className="size-5 text-amber-500" />
              <span className="mt-2 block text-xs font-semibold text-foreground">{item.title}</span>
              <span className="block text-[10px] text-muted-foreground">{item.desc}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Modal de ferramentas acessível a partir da navegação */
function NavToolsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  if (!open) return null;

  const tools = [
    {
      title: "Calculadora Científica",
      desc: "Trigonometria, caldeiraria e conversões angulares",
      icon: Calculator,
      color: "caldra-bubble-amber text-amber-500",
      to: "/calculadora",
    },
    {
      title: "Traçagem Paramétrica",
      desc: "Modelos 3D, planificação zero fresta e traçagem passo a passo",
      icon: Compass,
      color: "caldra-bubble-sky text-sky-500",
      to: "/tracagem",
    },
    {
      title: "Prancheta CAD 2D CHAMFER",
      desc: "Desenho vetorial técnico, cotas e exportação DXF",
      icon: PenTool,
      color: "caldra-bubble-red text-red-500",
      to: "/desenho-2d",
    },
    {
      title: "Bancada de Chapas e Nesting",
      desc: "Aproveitamento de retalho e plano de corte na chapa",
      icon: Layers,
      color: "caldra-bubble-emerald text-emerald-500",
      to: "/oficina",
      search: { tab: "chapa" },
    },
    {
      title: "Tarifas de Máquina e Custos",
      desc: "Cálculo de corte por metro, perfuração e dobra",
      icon: TrendingUp,
      color: "caldra-bubble-indigo text-indigo-500",
      to: "/oficina",
      search: { tab: "custo" },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,500px)] overflow-y-auto border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <Wrench className="size-4.5" />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Bancada de Ferramentas
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Ferramentas técnicas operacionais de cálculo, traçado e oficina metálica.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-2">
          {tools.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                onClose();
                if (t.search) {
                  void navigate({ to: t.to, search: t.search });
                } else {
                  void navigate({ to: t.to });
                }
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 text-left transition-all hover:border-border hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className={cn("caldra-bubble-base size-10 shrink-0", t.color)}>
                  <t.icon className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
