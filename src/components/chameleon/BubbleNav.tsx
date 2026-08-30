import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, FolderKanban, Settings, Sigma } from "lucide-react";
import { ChameleonMark } from "./Logo";
import { cn } from "@/lib/utils";

type Bubble = {
  to: string;
  name: string;
  icon: ((p: { className?: string }) => React.ReactNode) | typeof Compass;
  /** posição no sistema orbital, em px relativos ao núcleo */
  x: number;
  y: number;
  delay: number;
  core?: boolean;
};

const BUBBLES: Bubble[] = [
  { to: "/", name: "Início", icon: ChameleonMark, x: 0, y: 0, delay: 0, core: true },
  { to: "/escola", name: "Estudos", icon: Sigma, x: 0, y: -66, delay: 120 },
  { to: "/tracagem", name: "Traçagem", icon: Compass, x: -66, y: 0, delay: 60 },
  { to: "/projetos", name: "Projetos", icon: FolderKanban, x: 66, y: 0, delay: 180 },
  { to: "/configuracoes", name: "Configurações", icon: Settings, x: 0, y: 66, delay: 240 },
];

/** Navegação orbital: cinco bolhas que revelam o nome apenas na interação. */
export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+14px)] lg:inset-x-auto lg:right-10 lg:bottom-1/2 lg:translate-y-1/2 lg:justify-end lg:pb-0"
    >
      <div className="pointer-events-auto relative size-[188px]">
        {BUBBLES.map((b) => {
          const Icon = b.icon as (p: { className?: string }) => React.ReactNode;
          const on = active(b.to);
          const size = b.core ? 62 : 48;
          return (
            <Link
              key={b.to}
              to={b.to}
              aria-label={b.name}
              style={{
                left: `calc(50% + ${b.x}px)`,
                top: `calc(50% + ${b.y}px)`,
                width: size,
                height: size,
                animationDelay: `${b.delay}ms`,
              }}
              className={cn(
                "group absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full",
                "pop-in transition-all duration-500 [transition-timing-function:cubic-bezier(.22,1,.36,1)]",
                "glass backdrop-blur-xl hover:scale-110 focus-visible:scale-110 focus-visible:outline-none",
                on
                  ? "scale-110 text-accent glow-ring"
                  : "text-muted-foreground hover:text-accent focus-visible:text-accent",
                b.core && "shadow-lg",
              )}
            >
              {b.core && (
                <span
                  aria-hidden
                  className="brand-gradient absolute inset-0 rounded-full opacity-15 transition-opacity duration-500 group-hover:opacity-30"
                />
              )}
              <Icon className={cn("relative", b.core ? "size-7" : "size-[18px]")} />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-full mt-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] whitespace-nowrap uppercase",
                  "bg-background/70 text-foreground backdrop-blur-md",
                  "translate-y-1 scale-95 opacity-0 blur-[2px] transition-all duration-300",
                  "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0",
                  "group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:blur-0",
                )}
              >
                {b.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
