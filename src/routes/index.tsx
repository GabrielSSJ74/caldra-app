import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { ArrowUpRight, Calculator, FolderKanban, PenTool, Sigma } from "lucide-react";
import { DEMO_HISTORY } from "@/lib/projects/demo-data";
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
      <defs>
        <radialGradient id="mini-grid-fade" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="60%" stopColor="#fff" stopOpacity=".7" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="mini-grid-mask">
          <rect x="0" y="0" width="120" height="80" fill="url(#mini-grid-fade)" />
        </mask>
      </defs>
      <g stroke="#000000" strokeWidth=".4" opacity=".5" mask="url(#mini-grid-mask)">
        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((x) => (
          <path key={`v${x}`} d={`M${x} 6 V74`} />
        ))}
        {[10, 20, 30, 40, 50, 60, 70].map((y) => (
          <path key={`h${y}`} d={`M8 ${y} H112`} />
        ))}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="58" cy="40" r="28" />
        <circle cx="58" cy="40" r="10" />
      </g>
      <circle
        cx="58"
        cy="40"
        r="19"
        fill="none"
        stroke="currentColor"
        strokeWidth=".6"
        strokeDasharray="4 3"
        opacity=".6"
      />
      <g stroke="var(--accent)" strokeWidth=".6" opacity=".8">
        <path d="M26 40 H90" strokeDasharray="6 3 1 3" />
        <path d="M58 8 V72" strokeDasharray="6 3 1 3" />
      </g>
      <g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const r = (a * Math.PI) / 180;
          const cx = 58 + 19 * Math.cos(r);
          const cy = 40 + 19 * Math.sin(r);
          const drawing = a === 315;
          return (
            <circle
              key={a}
              cx={cx}
              cy={cy}
              r="3.4"
              fill="none"
              stroke={drawing ? "var(--accent)" : "currentColor"}
              strokeWidth={drawing ? 1.4 : 1}
              strokeDasharray={drawing ? "2.5 2" : undefined}
            />
          );
        })}
      </g>
      <g transform="rotate(35 72 27)">
        <path d="M67 -12 h10 v27 h-10 Z" fill="var(--accent)" />
        <path d="M71.5 -12 v27" stroke="var(--background)" strokeWidth=".8" opacity=".45" />
        <path d="M67 -16 h10 v4 h-10 Z" fill="currentColor" opacity=".45" />
        <path d="M67 -20 h10 v4 h-10 Z" fill="var(--accent)" opacity=".5" />
        <path d="M67 15 h10 l-5 8 Z" fill="currentColor" opacity=".35" />
        <path d="M70.2 20 h3.6 l-1.8 3 Z" fill="currentColor" />
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

function MiniCalculator() {
  return (
    <svg viewBox="0 0 120 80" className="size-full" aria-hidden>
      <rect x="30" y="7" width="60" height="66" rx="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="38" y="15" width="44" height="14" rx="2" fill="none" stroke="var(--accent2)" strokeWidth="1" />
      <path d="M43 24h22l7-5" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={38 + col * 11}
            y={36 + row * 8}
            width="7"
            height="4.5"
            rx="1"
            fill={col === 3 ? "var(--accent)" : "none"}
            stroke={col === 3 ? "var(--accent)" : "currentColor"}
            strokeWidth=".8"
          />
        )),
      )}
      <path d="M95 18h12M101 12v12" stroke="var(--accent)" strokeWidth="1" opacity=".8" />
      <text x="13" y="59" fill="currentColor" fontFamily="ui-monospace, monospace" fontSize="9" opacity=".7">sin</text>
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
        <div className="mt-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-accent/60 to-transparent" />
          <span className="tick-label">{`\n`}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:grid-rows-2">
        <Link
          to="/tracagem"
          className="metal group relative col-span-2 row-span-2 flex min-h-[240px] flex-col justify-between overflow-hidden rounded-3xl p-5 transition-all duration-500 hover:amber-ring lg:min-h-[340px]"
        >
          <div className="relative z-10">
            <span className="tick-label text-accent"></span>
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
            <span className="tick-label">{`\n`}</span>
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
            <span className="tick-label">{`\n`}</span>
          </div>
          <div className="pointer-events-none absolute inset-x-2 top-6 h-20 text-muted-foreground/70">
            <MiniFolders />
          </div>
          <span className="relative font-display text-sm font-medium tracking-wide">PROJETOS</span>
        </Link>

        <Link
          to="/escola"
          className="metal group relative flex min-h-[110px] items-center justify-between overflow-hidden rounded-3xl p-4 transition-all duration-500 hover:amber-ring lg:col-start-3 lg:row-start-2"
        >
          <div className="relative z-10 flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sigma className="size-4 text-accent" strokeWidth={1.4} />
              <span className="tick-label">{`\n`}</span>
            </div>
            <span className="font-display text-sm font-medium tracking-wide">ESTUDOS</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              Fórmulas e aulas
            </span>
          </div>
          <div className="pointer-events-none hidden h-20 w-28 shrink-0 text-muted-foreground/60 sm:block lg:hidden xl:block">
            <MiniMath />
          </div>
        </Link>

        <Link
          to="/calculadora"
          className="metal group relative flex min-h-[110px] items-center justify-between overflow-hidden rounded-3xl p-4 transition-all duration-500 hover:amber-ring lg:col-start-3 lg:row-start-3"
        >
          <div className="relative z-10 flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-accent" strokeWidth={1.4} />
              <span className="tick-label">{` `}</span>
            </div>
            <span className="font-display text-[13px] leading-tight font-medium tracking-wide">
              CALCULADORA<br />CIENTÍFICA
            </span>
          </div>
          <div className="pointer-events-none absolute inset-y-2 right-0 w-[58%] text-muted-foreground/60 sm:relative sm:inset-auto sm:h-20 sm:w-28 sm:shrink-0 lg:absolute lg:inset-y-2 lg:right-0 lg:w-[55%] xl:relative xl:inset-auto xl:h-20 xl:w-28">
            <MiniCalculator />
          </div>
        </Link>
      </div>
    </div>
  );
}
