import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GEOMETRIES, type GeometryLevel } from "@/lib/geometry/catalog";
import { StatusBadge } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracagem/")({
  head: () => ({
    meta: [
      { title: "Traçagem — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Catálogo de geometrias de caldeiraria: transições, cones, curvas de gomos, tês e bocas de lobo.",
      },
      { property: "og:title", content: "Traçagem — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Escolha a geometria e gere o desenvolvimento com matemática de traçagem real.",
      },
    ],
  }),
  component: TracagemIndex,
});

const LEVELS: (GeometryLevel | "Todos")[] = ["Todos", "Básico", "Intermediário", "Avançado"];

function TracagemIndex() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Todos");

  const list = useMemo(
    () =>
      GEOMETRIES.filter(
        (g) =>
          (level === "Todos" || g.level === level) &&
          (g.name + g.short).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, level],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Traçagem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {GEOMETRIES.length} geometrias catalogadas. Comece pela transição quadrado → redondo,
          totalmente calculada.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="glass flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar geometria…"
            className="w-full bg-transparent py-2.5 text-sm outline-none"
          />
        </label>
        <div className="flex gap-1 overflow-x-auto">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 font-mono text-[10px] tracking-wider uppercase transition-colors",
                level === l
                  ? "bg-accent/12 text-accent ring-1 ring-accent/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <Link
            key={g.slug}
            to="/tracagem/$slug"
            params={{ slug: g.slug }}
            className="glass group rounded-2xl p-4 transition-colors hover:border-accent/30"
          >
            <div className="flex items-start justify-between gap-2">
              <svg viewBox="0 0 48 48" className="size-11 text-accent">
                <path
                  d={g.icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              <StatusBadge status={g.status} />
            </div>
            <p className="mt-3 font-display text-sm font-medium">{g.name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{g.short}</p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              {g.level} · {g.method}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
