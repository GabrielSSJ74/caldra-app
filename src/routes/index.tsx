import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Compass, PenTool } from "lucide-react";
import { DEMO_HISTORY, DEMO_PROJECTS } from "@/lib/projects/demo-data";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CHAMELEON — Laboratório Caldeireiro" },
      {
        name: "description",
        content:
          "Laboratório digital de caldeiraria: traçagem, desenvolvimento vetorial 3D, desenho 2D e estudos técnicos.",
      },
      { property: "og:title", content: "CHAMELEON — Laboratório Caldeireiro" },
      {
        property: "og:description",
        content: "Pense, calcule, desenhe e prepare peças de caldeiraria em um só ambiente.",
      },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const project = DEMO_PROJECTS[0];
  const last = DEMO_HISTORY[0];
  const model = buildWire("quadrado-redondo", DEFAULT_PARAMS);

  return (
    <div className="relative flex min-h-[70vh] flex-col justify-center gap-12">
      <div className="pointer-events-none absolute -top-10 right-0 hidden text-accent/50 lg:block">
        <Wire3D model={model} autoSpin className="size-72 opacity-40" />
      </div>

      <header className="relative">
        <h1 className="text-brand-gradient font-display text-5xl leading-none font-semibold tracking-tight lg:text-7xl">
          CHAMELEON
        </h1>
        <p className="mt-3 font-mono text-[11px] tracking-[0.4em] text-muted-foreground uppercase">
          Laboratório Caldeireiro
        </p>
      </header>

      <div className="relative grid gap-3 sm:grid-cols-3">
        <Link
          to="/tracagem"
          className="glass group flex items-center gap-3 rounded-2xl p-4 transition-all hover:scale-[1.02] hover:glow-ring"
        >
          <Compass className="size-5 text-accent" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase">Traçar</span>
          <ArrowUpRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
        </Link>

        <Link
          to="/desenho-2d"
          className="glass group flex items-center gap-3 rounded-2xl p-4 transition-all hover:scale-[1.02] hover:glow-ring"
        >
          <PenTool className="size-5 text-accent" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase">Lab 2D</span>
          <ArrowUpRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
        </Link>

        {project && (
          <Link
            to="/projetos"
            className="glass group flex items-center gap-3 rounded-2xl p-4 transition-all hover:scale-[1.02] hover:glow-ring"
          >
            <span className="grid size-8 place-items-center rounded-full bg-accent/10 font-mono text-[10px] text-accent">
              {project.progress}%
            </span>
            <span className="min-w-0 truncate text-[12px]">{project.name}</span>
          </Link>
        )}
      </div>

      {last && (
        <p className="relative font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase">
          {last.label} · {last.when}
        </p>
      )}
    </div>
  );
}
