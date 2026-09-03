import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Factory, FolderKanban, Settings, Sigma } from "lucide-react";
import { ChameleonMark } from "./Logo";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  name: string;
  icon: ((p: { className?: string }) => React.ReactNode) | typeof Compass;
  core?: boolean;
};

const ITEMS: Item[] = [
  { to: "/tracagem", name: "Traçagem", icon: Compass },
  { to: "/escola", name: "Estudos", icon: Sigma },
  { to: "/", name: "Início", icon: ChameleonMark, core: true },
  { to: "/projetos", name: "Projetos", icon: FolderKanban },
  { to: "/oficina", name: "Oficina", icon: Factory },
  { to: "/configuracoes", name: "Configurações", icon: Settings },
];

/** Cápsula flutuante: ícones discretos, nome revelado só na interação. */
export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]"
    >
      <div className="metal pointer-events-auto flex items-center gap-0.5 rounded-full p-1 backdrop-blur-xl">
        {ITEMS.map((item) => {
          const Icon = item.icon as (p: { className?: string }) => React.ReactNode;
          const on = active(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.name}
              className={cn(
                "group relative grid place-items-center rounded-full",
                item.core ? "size-11" : "size-9",
                "transition-all duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)]",
                "hover:scale-110 active:scale-95 focus-visible:scale-110 focus-visible:outline-none",
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
      </div>
    </nav>
  );
}
