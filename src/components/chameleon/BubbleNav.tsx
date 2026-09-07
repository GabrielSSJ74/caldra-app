import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Calculator,
  Compass,
  Factory,
  FolderKanban,
  HelpCircle,
  History,
  LayoutGrid,
  Library,
  Settings,
  Sigma,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import { ChameleonMark } from "./Logo";
import { useShellActions } from "./ShellActions";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  name: string;
  icon: ((p: { className?: string }) => React.ReactNode) | typeof Compass;
  core?: boolean;
};

/** Exatamente 5 posições — INÍCIO no centro. */
const ITEMS: Item[] = [
  { to: "/tracagem", name: "Traçagem", icon: Compass },
  { to: "/escola", name: "Estudos", icon: Sigma },
  { to: "/", name: "Início", icon: ChameleonMark, core: true },
  { to: "/projetos", name: "Projetos", icon: FolderKanban },
];

const MORE_ROUTES = ["/configuracoes", "/biblioteca", "/oficina", "/conta", "/calculadora"];

/** Cápsula flutuante: ícones discretos, nome revelado só na interação. */
export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const moreActive = MORE_ROUTES.some((r) => pathname.startsWith(r));

  const cell =
    "group relative grid place-items-center rounded-full transition-all duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)] hover:scale-110 active:scale-95 focus-visible:scale-110 focus-visible:outline-none";

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div className="metal pointer-events-auto grid grid-cols-5 items-center justify-items-center gap-0.5 rounded-full p-1 backdrop-blur-xl">
          {ITEMS.map((item) => {
            const Icon = item.icon as (p: { className?: string }) => React.ReactNode;
            const on = active(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label={item.name}
                className={cn(
                  cell,
                  item.core ? "size-11" : "size-9",
                  on
                    ? "bg-accent/12 text-accent amber-ring"
                    : "text-muted-foreground hover:text-foreground focus-visible:text-foreground",
                )}
              >
                {item.core && (
                  <span
                    aria-hidden
                    className="brand-gradient absolute inset-0 rounded-full opacity-20 transition-opacity duration-500 group-hover:opacity-35"
                  />
                )}
                <Icon className={cn("relative", item.core ? "size-5" : "size-[17px]")} />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute bottom-full mb-2 rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] whitespace-nowrap uppercase",
                    "bg-card text-foreground hairline",
                    "translate-y-1 scale-95 opacity-0 transition-all duration-300",
                    "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
                    "group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
                  )}
                >
                  {item.name}
                </span>
                {on && (
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 h-0.5 w-4 rounded-full bg-accent"
                  />
                )}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              cell,
              "size-9",
              moreActive || moreOpen
                ? "bg-accent/12 text-accent amber-ring"
                : "text-muted-foreground hover:text-foreground focus-visible:text-foreground",
            )}
          >
            <LayoutGrid className="relative size-[17px]" />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-full mb-2 rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] whitespace-nowrap uppercase",
                "bg-card text-foreground hairline",
                "translate-y-1 scale-95 opacity-0 transition-all duration-300",
                "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
                "group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
              )}
            >
              Mais
            </span>
            {moreActive && (
              <span aria-hidden className="absolute -bottom-0.5 h-0.5 w-4 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

type Entry = {
  name: string;
  icon: typeof Compass;
  to?: string;
  action?: "profile" | "master";
};

const MORE: Entry[] = [
  { name: "Calculadora", icon: Calculator, to: "/calculadora" },
  { name: "Configurações", icon: Settings, to: "/configuracoes" },
  { name: "Perfil", icon: User, action: "profile" },
  { name: "Modo Mestre", icon: Sparkles, action: "master" },
  { name: "Biblioteca", icon: Library, to: "/biblioteca" },
  { name: "Histórico", icon: History, to: "/projetos" },
  { name: "Favoritos", icon: Star, to: "/biblioteca" },
  { name: "Oficina", icon: Factory, to: "/oficina" },
  { name: "Ajuda", icon: HelpCircle, to: "/escola" },
];

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { openProfile, openMaster } = useShellActions();
  if (!open) return null;

  const go = (e: Entry) => {
    onClose();
    if (e.action === "profile") return openProfile();
    if (e.action === "master") return openMaster();
    if (e.to) void navigate({ to: e.to });
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Fechar menu"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-200"
      />
      <div
        role="dialog"
        aria-label="Mais opções"
        className="metal absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+78px)] mx-auto max-w-md rounded-3xl p-4 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 [animation-timing-function:cubic-bezier(.22,1,.36,1)]"
      >
        <div className="mb-3 flex items-center gap-3">
          <BookOpen className="size-3.5 text-accent" strokeWidth={1.4} />
          <span className="font-mono text-[9px] tracking-[0.22em] text-muted-foreground uppercase">
            Mais
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {MORE.map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.name}
                type="button"
                onClick={() => go(e)}
                className="hairline flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-background/40 p-2 text-center transition-all duration-200 hover:bg-accent/10 hover:text-accent active:scale-95"
              >
                <Icon className="size-4 text-accent" strokeWidth={1.4} />
                <span className="font-mono text-[9px] leading-tight tracking-[0.1em] uppercase">
                  {e.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
