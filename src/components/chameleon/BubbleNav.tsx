import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, FolderKanban, Settings, Sigma } from "lucide-react";
import { ChameleonMark } from "./Logo";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  name: string;
  icon: ((p: { className?: string }) => React.ReactNode) | typeof Compass;
  core?: boolean;
};

const ITEMS: Item[] = [
  { to: "/", name: "Início", icon: ChameleonMark, core: true },
  { to: "/tracagem", name: "Traçagem", icon: Compass },
  { to: "/escola", name: "Estudos", icon: Sigma },
  { to: "/projetos", name: "Projetos", icon: FolderKanban },
  { to: "/configuracoes", name: "Configurações", icon: Settings },
];

/** Barra de aplicativos: ícones lado a lado, nomes revelados na interação. */
export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+14px)]"
    >
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5 backdrop-blur-xl">
        {ITEMS.map((item) => {
          const Icon = item.icon as (p: { className?: string }) => React.ReactNode;
          const on = active(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.name}
              className={cn(
                "group relative grid size-11 place-items-center rounded-full",
                "transition-all duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)]",
                "hover:scale-110 focus-visible:scale-110 focus-visible:outline-none",
                on
                  ? "scale-105 bg-accent/10 text-accent glow-ring"
                  : "text-muted-foreground hover:text-accent focus-visible:text-accent",
              )}
            >
              {item.core && (
                <span
                  aria-hidden
                  className="brand-gradient absolute inset-0 rounded-full opacity-15 transition-opacity duration-500 group-hover:opacity-30"
                />
              )}
              <Icon className="relative size-[18px]" />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute bottom-full mb-2 rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] whitespace-nowrap uppercase",
                  "bg-background/70 text-foreground backdrop-blur-md",
                  "translate-y-1 scale-95 opacity-0 blur-[2px] transition-all duration-300",
                  "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0",
                  "group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:blur-0",
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
