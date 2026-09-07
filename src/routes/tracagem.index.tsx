import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { GEOMETRIES } from "@/lib/geometry/catalog";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracagem/")({
  head: () => ({
    meta: [
      { title: "Traçagem — CALDRA" },
      {
        name: "description",
        content:
          "Galeria vetorial 3D de geometrias de caldeiraria: transições, cones, curvas de gomos, tês e bocas de lobo.",
      },
      { property: "og:title", content: "Traçagem — CALDRA" },
      {
        property: "og:description",
        content: "Escolha a peça pelo modelo 3D e gere o desenvolvimento com matemática real.",
      },
    ],
  }),
  component: TracagemIndex,
});

function TracagemIndex() {
  const [query, setQuery] = useState("");
  const { can } = useFeatureAccess();

  const list = useMemo(
    () =>
      GEOMETRIES.filter((g) => g.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <span className="tick-label">Biblioteca de peças</span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">TRAÇAR</h1>
      </header>

      <div className="flex items-center gap-2">
        <label className="metal flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 sm:max-w-xs">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar geometria"
            placeholder="Buscar"
            className="w-full bg-transparent py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
        </label>
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
              className="metal pop-in group relative aspect-square overflow-hidden rounded-3xl transition-all duration-500 hover:scale-[1.02] hover:amber-ring"
            >
              <span
                aria-hidden
                className="grid-bg-fine pointer-events-none absolute inset-0 opacity-40"
              />
              <Wire3D
                model={buildWire(g.slug, { ...DEFAULT_PARAMS, seg: 20 })}
                className="absolute inset-0 size-full p-3 text-foreground/85 transition-transform duration-700 group-hover:scale-110"
              />
              <span className="absolute top-2.5 right-3 tick-label">{g.level.charAt(0)}</span>
              {locked && (
                <Lock className="absolute top-2.5 left-3 size-3 text-accent/70" aria-label="Mestre" />
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/90 to-transparent px-3 pt-6 pb-2.5 text-center font-mono text-[9px] tracking-[0.16em] uppercase">
                {g.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
