import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Compass, GraduationCap, Layers, PenTool, Sparkles } from "lucide-react";
import { GEOMETRIES } from "@/lib/geometry/catalog";
import { DEMO_HISTORY, DEMO_PROJECTS } from "@/lib/projects/demo-data";
import { MODULES } from "@/lib/education/courses";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { DemoTag, Panel, SectionLabel, StatusBadge } from "@/components/chameleon/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Laboratório — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Cockpit do laboratório: traçagem, planificação, desenho 2D, projetos e escola técnica de caldeiraria.",
      },
      { property: "og:title", content: "Laboratório — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Pense, calcule, desenhe e prepare peças de caldeiraria em um só lugar.",
      },
    ],
  }),
  component: Dashboard,
});

const ACTIONS = [
  { to: "/tracagem", label: "Traçagem", hint: "18 geometrias", icon: Compass },
  { to: "/planificacao", label: "Planificação", hint: "Chapa e nesting", icon: Layers },
  { to: "/desenho-2d", label: "Desenho 2D", hint: "Editor vetorial", icon: PenTool },
  { to: "/escola", label: "Escola", hint: "Aulas e fórmulas", icon: GraduationCap },
];

function Dashboard() {
  const { isMestre } = useFeatureAccess();
  const ready = GEOMETRIES.filter((g) => g.status === "pronto");
  const lessons = MODULES.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="space-y-5">
      {/* HERO */}
      <Panel className="relative overflow-hidden p-5 lg:p-7" glow>
        <div className="grid-bg absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <span className="font-mono text-[10px] tracking-[0.22em] text-accent uppercase">
            Laboratório digital de caldeiraria
          </span>
          <h1 className="mt-2 max-w-2xl font-display text-2xl leading-tight font-semibold lg:text-4xl">
            Transforme medidas em peças prontas para fabricar.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Triangulação real, desenvolvimento em escala, exportação técnica e uma escola integrada
            para entender cada fórmula que você usa.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/tracagem/$slug"
              params={{ slug: "quadrado-redondo" }}
              className="brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-background"
            >
              Abrir Quadrado → Redondo <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/tracagem"
              className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Ver todas as geometrias
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
            <Stat value={String(GEOMETRIES.length)} label="Geometrias" />
            <Stat value={String(ready.length)} label="Prontas" />
            <Stat value={String(lessons)} label="Aulas" />
          </div>
        </div>
      </Panel>

      {/* ATALHOS */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="glass group rounded-2xl p-4 transition-colors hover:border-accent/30"
          >
            <a.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-sm font-medium">{a.label}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{a.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* GEOMETRIAS */}
        <section>
          <SectionLabel
            action={
              <Link to="/tracagem" className="font-mono text-[10px] text-accent">
                Ver tudo
              </Link>
            }
          >
            Geometrias em destaque
          </SectionLabel>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {GEOMETRIES.slice(0, 4).map((g) => (
              <Link
                key={g.slug}
                to="/tracagem/$slug"
                params={{ slug: g.slug }}
                className="glass flex gap-3 rounded-2xl p-3.5 transition-colors hover:border-accent/30"
              >
                <svg viewBox="0 0 48 48" className="size-10 shrink-0 text-accent">
                  <path
                    d={g.icon}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-medium">{g.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{g.short}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={g.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* LATERAL */}
        <div className="space-y-4">
          <section>
            <SectionLabel>Cálculos recentes</SectionLabel>
            <Panel className="divide-y divide-line">
              {DEMO_HISTORY.map((h) => (
                <Link
                  key={h.id}
                  to="/tracagem/$slug"
                  params={{ slug: h.geometry }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5"
                >
                  <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{h.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{h.when}</span>
                </Link>
              ))}
            </Panel>
          </section>

          <section>
            <SectionLabel action={<DemoTag />}>Projetos</SectionLabel>
            <Panel className="space-y-3 p-3.5">
              {DEMO_PROJECTS.map((p) => (
                <Link key={p.id} to="/projetos" className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px]">{p.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.progress}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                    <div className="brand-gradient h-full" style={{ width: `${p.progress}%` }} />
                  </div>
                </Link>
              ))}
            </Panel>
          </section>

          {!isMestre && (
            <Panel className="p-4">
              <Sparkles className="size-4 text-accent" />
              <p className="mt-2 font-display text-sm">Modo Mestre</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Libere explicações passo a passo, exportação DXF/PDF, editor 2D e a biblioteca
                completa.
              </p>
              <Link
                to="/configuracoes"
                className="mt-3 inline-block rounded-xl border border-accent/25 bg-accent/10 px-3 py-1.5 font-mono text-[11px] text-accent"
              >
                Ativar com código
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-background/40 p-2.5">
      <p className="font-mono text-lg">{value}</p>
      <p className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
