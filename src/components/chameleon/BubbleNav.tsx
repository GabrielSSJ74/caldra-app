import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Compass,
  FolderKanban,
  GraduationCap,
  User,
  Plus,
  Receipt,
  Wrench,
  Layers,
  ChevronRight,
  Calculator,
  PenTool,
} from "lucide-react";
import { CaldraLogo } from "@/components/caldra/Logo";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { createProject, type NewProjectInput } from "@/lib/projects/store";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Mapeamento de estado ativo para cada um dos 5 destinos
  const isHome = pathname === "/";
  const isProjetar =
    pathname.startsWith("/projetar") ||
    pathname.startsWith("/tracagem") ||
    pathname.startsWith("/desenho-2d") ||
    pathname.startsWith("/calculadora");
  const isProduzir =
    pathname.startsWith("/produzir") ||
    pathname.startsWith("/projetos") ||
    pathname.startsWith("/oficina") ||
    pathname.startsWith("/planificacao");
  const isAprenda =
    pathname.startsWith("/aprenda") ||
    pathname.startsWith("/escola") ||
    pathname.startsWith("/biblioteca");
  const isPerfil =
    pathname.startsWith("/perfil") ||
    pathname.startsWith("/conta") ||
    pathname.startsWith("/configuracoes") ||
    pathname.startsWith("/pro");

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
        aria-label="Navegação principal da oficina digital"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+6px)] px-3 pointer-events-none select-none"
      >
        <div className="caldra-dock pointer-events-auto flex w-full max-w-md items-center justify-between rounded-3xl px-2 py-1.5">
          {/* =========================================================================
              1. PROJETAR (Crie e Calcule: Traçagem, CHAMFER, Calculadora)
              ========================================================================= */}
          <Link
            to="/projetar"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Projetar (Crie e Calcule)"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isProjetar
                ? "text-amber-500 dark:text-amber-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <Compass className="size-5" strokeWidth={isProjetar ? 2.2 : 1.75} />
            <span className="font-mono text-[10px] tracking-tight">Projetar</span>
          </Link>

          {/* =========================================================================
              2. PRODUZIR (Orce e Fabrique: Projetos, Gabaritos, Oficina)
              ========================================================================= */}
          <Link
            to="/produzir"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Produzir (Orce e Fabrique)"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isProduzir
                ? "text-amber-500 dark:text-amber-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <FolderKanban className="size-5" strokeWidth={isProduzir ? 2.2 : 1.75} />
            <span className="font-mono text-[10px] tracking-tight">Produzir</span>
          </Link>

          {/* =========================================================================
              3. HOME (Início: Tela inicial com logotipo oficial CALDRA)
              ========================================================================= */}
          <div className="flex flex-1 items-center justify-center -my-3">
            <Link
              to="/"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              aria-label="Página inicial (Home)"
              className={cn(
                "group relative flex size-13 items-center justify-center rounded-full border-2 caldra-bubble-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer touch-manipulation",
                isHome
                  ? "border-amber-500 shadow-amber-500/30 ring-2 ring-amber-500/20"
                  : "border-amber-500/60 shadow-amber-500/15 hover:border-amber-500",
              )}
            >
              <CaldraLogo size={28} glow={isHome} />
              <span className="pointer-events-none absolute inset-0 rounded-full border border-amber-400/40 opacity-40 group-hover:opacity-100 transition-opacity" />
            </Link>
          </div>

          {/* =========================================================================
              4. APRENDA (Aprimore: Estudos, Fórmulas, Tabelas, Biblioteca)
              ========================================================================= */}
          <Link
            to="/aprenda"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Aprenda (Aprimore)"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isAprenda
                ? "text-amber-500 dark:text-amber-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <GraduationCap className="size-5" strokeWidth={isAprenda ? 2.2 : 1.75} />
            <span className="font-mono text-[10px] tracking-tight">Aprenda</span>
          </Link>

          {/* =========================================================================
              5. PERFIL (Perfil e Conta: Perfil, Conta, CALDRA Pro, Configurações)
              ========================================================================= */}
          <Link
            to="/perfil"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            aria-label="Perfil e Conta"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 rounded-2xl transition-all duration-150 touch-manipulation cursor-pointer",
              isPerfil
                ? "text-amber-500 dark:text-amber-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            <User className="size-5" strokeWidth={isPerfil ? 2.2 : 1.75} />
            <span className="font-mono text-[10px] tracking-tight">Perfil</span>
          </Link>
        </div>
      </nav>

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

/** Modal de ferramentas acessível quando chamado por atalhos */
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
