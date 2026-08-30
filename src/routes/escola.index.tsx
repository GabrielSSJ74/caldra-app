import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, GraduationCap } from "lucide-react";
import { MODULES } from "@/lib/education/courses";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { Panel, PlanBadge, SectionLabel } from "@/components/chameleon/ui";

export const Route = createFileRoute("/escola/")({
  head: () => ({
    meta: [
      { title: "Escola — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Aulas de caldeiraria: fundamentos, geometria aplicada, traçagem, materiais e soldagem.",
      },
      { property: "og:title", content: "Escola — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Entenda a teoria, a fórmula e a aplicação prática de cada cálculo.",
      },
    ],
  }),
  component: EscolaIndex,
});

function EscolaIndex() {
  const { isMestre } = useFeatureAccess();
  const total = MODULES.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Escola</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {MODULES.length} módulos · {total} aulas. Cada aula traz teoria, exemplo numérico, fórmula
          e exercício.
        </p>
      </header>

      {MODULES.map((m) => (
        <section key={m.slug}>
          <SectionLabel action={<GraduationCap className="size-4 text-accent" />}>
            {m.title}
          </SectionLabel>
          <p className="mb-2 text-[12px] text-muted-foreground">{m.summary}</p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {m.lessons.map((l) => (
              <Link
                key={l.slug}
                to="/escola/$slug"
                params={{ slug: l.slug }}
                className="glass rounded-2xl p-3.5 transition-colors hover:border-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[13px] font-medium">{l.title}</p>
                  <PlanBadge premium={!l.free} />
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{l.theory}</p>
                <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <Clock className="size-3" /> {l.minutes} min
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {!isMestre && (
        <Panel className="p-4 text-[12px] text-muted-foreground">
          As aulas marcadas como Mestre incluem estudos de caso completos, tabelas de referência e
          exercícios resolvidos.
        </Panel>
      )}
    </div>
  );
}
