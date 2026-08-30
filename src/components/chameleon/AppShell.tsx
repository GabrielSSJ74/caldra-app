import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Compass,
  FolderKanban,
  GraduationCap,
  LayoutGrid,
  Layers,
  PenTool,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { MasterModeDialog } from "./MasterModeDialog";
import { ChameleonMark, Wordmark } from "./Logo";

type NavItem = { to: string; label: string; shortLabel: string; icon: typeof LayoutGrid };

const NAV: NavItem[] = [
  { to: "/", label: "Laboratório", shortLabel: "Lab", icon: LayoutGrid },
  { to: "/tracagem", label: "Traçagem", shortLabel: "Traçagem", icon: Compass },
  { to: "/planificacao", label: "Planificação", shortLabel: "Planif.", icon: Layers },
  { to: "/desenho-2d", label: "Desenho 2D", shortLabel: "Desenho", icon: PenTool },
  { to: "/projetos", label: "Projetos", shortLabel: "Projetos", icon: FolderKanban },
  { to: "/escola", label: "Escola", shortLabel: "Escola", icon: GraduationCap },
  { to: "/biblioteca", label: "Biblioteca", shortLabel: "Biblio.", icon: BookOpen },
];

const MOBILE_NAV = NAV.slice(0, 5);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [masterOpen, setMasterOpen] = useState(false);
  const { isMestre } = useFeatureAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      {/* luz ambiente */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 -left-24 size-72 rounded-full bg-accent/12 blur-3xl" />
        <div className="absolute top-40 -right-28 size-80 rounded-full bg-accent2/12 blur-3xl" />
        {isMestre && (
          <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-accent/8 blur-3xl" />
        )}
      </div>

      <div className="relative z-10 flex min-h-screen flex-1">
        {/* SIDEBAR DESKTOP */}
        <aside className="glass sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-y-0 border-l-0 px-3 py-4 lg:flex">
          <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
            <ChameleonMark className="size-9" />
            <Wordmark />
          </Link>
          <nav className="flex-1 space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                  isActive(item.to)
                    ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
          <button
            onClick={() => setMasterOpen(true)}
            className="glass mt-3 rounded-xl p-3 text-left transition-all hover:glow-ring"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Plano
              </span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase",
                  isMestre
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                {isMestre ? "Mestre" : "Free"}
              </span>
            </div>
            <p className="text-xs font-medium">
              {isMestre ? "Laboratório completo" : "Ativar Modo Mestre"}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="brand-gradient h-full transition-all duration-500"
                style={{ width: isMestre ? "100%" : "34%" }}
              />
            </div>
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* TOPO */}
          <header className="glass sticky top-0 z-30 flex items-center gap-3 border-x-0 border-t-0 px-4 py-3">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <ChameleonMark className="size-9" />
              <Wordmark />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setMasterOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase transition-all",
                  isMestre
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="size-3" />
                {isMestre ? "Mestre" : "Free"}
              </button>
              <Link
                to="/configuracoes"
                aria-label="Configurações"
                className="glass grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
              >
                <Settings className="size-4" />
              </Link>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-4 pb-24 lg:px-8 lg:py-6 lg:pb-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>

      {/* NAV INFERIOR MOBILE */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-2 py-2 lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
                isActive(item.to) ? "bg-accent/10 text-accent" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span className="text-[10px] leading-none">{item.shortLabel}</span>
            </Link>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      <MasterModeDialog open={masterOpen} onOpenChange={setMasterOpen} />
    </div>
  );
}
