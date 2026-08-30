import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { GEOMETRIES, type GeometryLevel } from "@/lib/geometry/catalog";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracagem/")({
  head: () => ({
    meta: [
      { title: "Traçagem — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Galeria vetorial 3D de geometrias de caldeiraria: transições, cones, curvas de gomos, tês e bocas de lobo.",
      },
      { property: "og:title", content: "Traçagem — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Escolha a peça pelo modelo 3D e gere o desenvolvimento com matemática real.",
      },
    ],
  }),
  component: TracagemIndex,
});

const LEVELS: (GeometryLevel | "•")[] = ["•", "Básico", "Intermediário", "Avançado"];

function TracagemIndex() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("•");
  const { can } = useFeatureAccess();

  const list = useMemo(
    () =>
      GEOMETRIES.filter(
        (g) =>
          (level === "•" || g.level === level) &&
          g.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, level],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label className="glass flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 sm:max-w-xs">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar geometria"
            className="w-full bg-transparent py-2.5 text-[13px] outline-none"
          />
        </label>
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              aria-label={l === "•" ? "Todos os níveis" : l}
              title={l === "•" ? "Todos" : l}
              className={cn(
                "size-8 rounded-full font-mono text-[10px] uppercase transition-all",
                level === l
                  ? "bg-accent/12 text-accent ring-1 ring-accent/25"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l === "•" ? "•" : l.charAt(0)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((g, i) => {
          const locked = !can(g.feature);
          return (
            <Link
              key={g.slug}
              to="/tracagem/$slug"
              params={{ slug: g.slug }}
              style={{ animationDelay: `${i * 24}ms` }}
              className="glass pop-in group relative aspect-square overflow-hidden rounded-3xl transition-all duration-500 hover:scale-[1.03] hover:glow-ring"
            >
              <Wire3D
                model={buildWire(g.slug, DEFAULT_PARAMS)}
                className="absolute inset-0 size-full p-3 text-foreground/70 transition-transform duration-700 group-hover:scale-110"
              />
              <span className="absolute top-2.5 right-3 font-mono text-[8px] tracking-[0.2em] text-muted-foreground/70 uppercase">
                {g.level.charAt(0)}
              </span>
              {locked && (
                <Lock className="absolute top-2.5 left-3 size-3 text-accent/70" aria-label="Mestre" />
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/80 to-transparent px-3 pt-6 pb-2.5 text-center font-mono text-[9px] tracking-[0.16em] uppercase">
                {g.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
