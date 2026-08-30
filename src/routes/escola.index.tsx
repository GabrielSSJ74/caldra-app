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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MODULES.map((m, i) => {
          const Icon = ICONS[i % ICONS.length]!;
          const active = open === m.slug;
          return (
            <button
              key={m.slug}
              onClick={() => setOpen(active ? null : m.slug)}
              style={{ animationDelay: `${i * 30}ms` }}
              className={cn(
                "glass pop-in flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl transition-all duration-500 hover:scale-[1.03]",
                active ? "text-accent glow-ring" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-8" strokeWidth={1.2} />
              <span className="px-2 text-center font-mono text-[9px] tracking-[0.16em] uppercase">
                {m.title}
              </span>
            </button>
          );
        })}
      </div>

      {MODULES.filter((m) => m.slug === open).map((m) => (
        <div key={m.slug} className="fade-up grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {m.lessons.map((l) => (
            <Link
              key={l.slug}
              to="/escola/$slug"
              params={{ slug: l.slug }}
              className="glass flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:text-accent"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{l.minutes}′</span>
              <span className="min-w-0 truncate text-[12px]">{l.title}</span>
              {!l.free && !isMestre && (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" />
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
