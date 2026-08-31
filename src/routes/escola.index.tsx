import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Compass,
  Flame,
  Layers,
  PencilRuler,
  Ruler,
  Sigma,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import { MODULES } from "@/lib/education/courses";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/escola/")({
  head: () => ({
    meta: [
      { title: "Estudos — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Estudos de caldeiraria: matemática, trigonometria, geometria, planificação, traçagem e dobra.",
      },
      { property: "og:title", content: "Estudos — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Diagramas, fórmulas e exemplos visuais em vez de longos textos.",
      },
    ],
  }),
  component: EstudosIndex,
});

const ICONS: LucideIcon[] = [Sigma, Triangle, Compass, Layers, PencilRuler, Ruler, Flame];

function EstudosIndex() {
  const [open, setOpen] = useState<string | null>(null);
  const { isMestre } = useFeatureAccess();

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <span className="tick-label">Aprendizagem visual</span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">ESTUDOS</h1>
      </header>

      <div className="divide-y divide-border overflow-hidden rounded-3xl metal">
        {MODULES.map((m, i) => {
          const Icon = ICONS[i % ICONS.length]!;
          const active = open === m.slug;
          return (
            <div key={m.slug}>
              <button
                onClick={() => setOpen(active ? null : m.slug)}
                className={cn(
                  "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 text-left transition-colors duration-300",
                  active ? "bg-accent/6 text-accent" : "hover:bg-foreground/3",
                )}
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-2xl transition-all duration-500",
                    active ? "bg-accent/12 amber-ring text-accent" : "hairline text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-[15px] font-medium tracking-tight">
                    {m.title}
                  </span>
                  <span className="tick-label">{m.lessons.length} aulas</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>

              {active && (
                <div className="fade-up grid gap-px bg-border/60 sm:grid-cols-2">
                  {m.lessons.map((l) => (
                    <Link
                      key={l.slug}
                      to="/escola/$slug"
                      params={{ slug: l.slug }}
                      className="flex items-center gap-3 bg-background/70 px-4 py-3 transition-colors hover:text-accent"
                    >
                      <span className="font-mono text-[10px] text-accent">{l.minutes}′</span>
                      <span className="min-w-0 truncate text-[12px]">{l.title}</span>
                      {!l.free && !isMestre && (
                        <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" />
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
