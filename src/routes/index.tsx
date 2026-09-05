import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { ArrowUpRight, FolderKanban, PenTool, Sigma } from "lucide-react";
import { DEMO_HISTORY, DEMO_PROJECTS } from "@/lib/projects/demo-data";
import { PieceCarousel } from "@/components/chameleon/PieceCarousel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CALDRA — Traçado e Planificação Zero Fresta" },
      {
        name: "description",
        content:
          "Laboratório digital de caldeiraria: traçagem, desenvolvimento vetorial 3D, desenho 2D e estudos técnicos.",
      },
      { property: "og:title", content: "CALDRA — Traçado e Planificação Zero Fresta" },
      {
        property: "og:description",
        content: "Pense, calcule, desenhe e prepare peças de caldeiraria em um só ambiente.",
      },
    ],
  }),
  component: Inicio,
});

/* miniaturas vetoriais — cada módulo tem identidade própria */

function MiniPlan() {
  return (
    <svg viewBox="0 0 120 80" className="size-full" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="14" y="14" width="92" height="52" rx="4" opacity=".5" />
        <circle cx="60" cy="40" r="17" />
        <circle cx="60" cy="40" r="8" opacity=".7" />
        {[0, 90, 180, 270].map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <circle key={a} cx={60 + 24 * Math.cos(r)} cy={40 + 24 * Math.sin(r)} r="3.2" />
          );
        })}
      </g>
      <g stroke="var(--accent)" strokeWidth=".9" opacity=".9">
        <path d="M14 72 H106" />
        <path d="M14 69 V75 M106 69 V75" />
      </g>
    </svg>
  );
}

function MiniMath() {
  return (
    <svg viewBox="0 0 120 80" className="size-full" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M18 62 H92 L18 18 Z" />
        <path d="M18 52 H28 V62" opacity=".7" />
        <path d="M40 62 a22 22 0 0 0 -3 -12" stroke="var(--accent)" />
      </g>
      <text
        x="66"
        y="34"
        fill="var(--accent)"
        fontFamily="ui-monospace, monospace"
        fontSize="11"
        opacity=".95"
      >
        α
      </text>
    </svg>
  );
}

function MiniFolders() {
  return (
    <svg viewBox="0 0 120 80" className="size-full" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M22 26 h20 l5 6 h30 v34 H22 Z" opacity=".45" />
        <path d="M32 34 h20 l5 6 h30 v34 H32 Z" opacity=".7" />
        <path d="M42 42 h20 l5 6 h30 v26 H42 Z" />
        <path d="M52 56 h34 M52 62 h22" stroke="var(--accent)" opacity=".9" />
      </g>
    </svg>
  );
}

function Inicio() {
  const project = DEMO_PROJECTS[0];
  const last = DEMO_HISTORY[0];
  const navigate = useNavigate();
  const taps = useRef<{ count: number; at: number }>({ count: 0, at: 0 });

  /* MODO QA interno: 5 toques no logo (ou ?qa=1). */
  const tapLogo = () => {
    const now = Date.now();
    taps.current =
      now - taps.current.at > 1200
        ? { count: 1, at: now }
        : { count: taps.current.count + 1, at: now };
    if (taps.current.count >= 5) {
      taps.current = { count: 0, at: 0 };
      void navigate({ to: "/qa" });
    }
  };

  return (
    <div className="relative space-y-6">
      <header className="relative pt-2">
        <h1
          onClick={tapLogo}
          className="text-brand-gradient font-display cursor-default text-[clamp(2.4rem,13vw,4.5rem)] leading-[0.9] font-semibold tracking-tight select-none"
        >
          CALDRA
        </h1>
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          Traçado e Planificação Zero Fresta
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-accent/60 to-transparent" />
          <span className="tick-label">{"\n"}</span>
        </div>
      </header>

      {/* composição assimétrica */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:grid-rows-2">
        <Link
          to="/tracagem"
          className="metal group relative col-span-2 row-span-2 flex min-h-[240px] flex-col justify-between overflow-hidden rounded-3xl p-5 transition-all duration-500 hover:amber-ring lg:min-h-[340px]"
        >
          <div className="relative z-10">
            <span className="tick-label text-accent">01 · Módulo principal</span>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight lg:text-3xl">
              TRAÇAGEM
            </h2>
          </div>
          <PieceCarousel className="absolute -right-6 -bottom-4 size-[86%]" />
          <div className="relative z-10 flex items-center gap-2 text-accent">
            <span className="tick-label text-accent">Abrir biblioteca</span>
            <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5" />
          </div>
        </Link>

        <Link
          to="/desenho-2d"
          className="metal group relative flex min-h-[130px] flex-col justify-between overflow-hidden rounded-3xl p-4 transition-all duration-500 hover:amber-ring"
        >
          <div className="flex items-center justify-between">
            <PenTool className="size-4 text-accent" strokeWidth={1.4} />
            <span className="tick-label">02</span>
          </div>
          <div className="pointer-events-none absolute inset-x-2 top-6 h-20 text-accent2/70 opacity-70">
            <MiniPlan />
          </div>
          <span className="relative font-display text-sm font-medium tracking-wide">CHAMFER</span>
        </Link>

        <Link
          to="/projetos"
          className="metal group relative flex min-h-[130px] flex-col justify-between overflow-hidden rounded-3xl p-4 transition-all duration-500 hover:amber-ring"
        >
          <div className="flex items-center justify-between">
            <FolderKanban className="size-4 text-accent" strokeWidth={1.4} />
            <span className="tick-label">03</span>
          </div>
          <div className="pointer-events-none absolute inset-x-2 top-6 h-20 text-muted-foreground/70">
            <MiniFolders />
          </div>
          <span className="relative font-display text-sm font-medium tracking-wide">PROJETOS</span>
        </Link>

        <Link
          to="/escola"
          className="metal group relative col-span-2 flex min-h-[110px] items-center justify-between overflow-hidden rounded-3xl p-4 transition-all duration-500 hover:amber-ring lg:col-span-1 lg:col-start-3 lg:row-start-2"
        >
          <div className="relative z-10 flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sigma className="size-4 text-accent" strokeWidth={1.4} />
              <span className="tick-label">04</span>
            </div>
            <span className="font-display text-sm font-medium tracking-wide">ESTUDOS</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              Fórmulas e aulas
            </span>
          </div>
          <div className="pointer-events-none h-20 w-28 shrink-0 text-muted-foreground/60">
            <MiniMath />
          </div>
        </Link>
      </div>

      {/* informação recente — indicadores compactos */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-border/60">
        <div className="bg-background/70 p-3">
          <p className="tick-label">Último projeto</p>
          <p className="mt-1 truncate text-[12px]">{project?.name ?? "—"}</p>
        </div>
        <div className="bg-background/70 p-3">
          <p className="tick-label">Última peça</p>
          <p className="mt-1 truncate text-[12px]">{last?.label ?? "—"}</p>
        </div>
        <div className="bg-background/70 p-3">
          <p className="tick-label">Progresso</p>
          <p className="mt-1 font-mono text-[13px] text-accent">{project?.progress ?? 0}%</p>
        </div>
      </div>
    </div>
  );
}
