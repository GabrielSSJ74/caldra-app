import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { LIBRARY_CATEGORIES, LIBRARY_ITEMS, type LibraryCategory } from "@/lib/library/catalog";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { Panel, PlanBadge } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Tabelas de tubos, chapas, perfis, materiais, soldagem, dobra, normas e conversões.",
      },
      { property: "og:title", content: "Biblioteca — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Referência técnica rápida para o chão de fábrica.",
      },
    ],
  }),
  component: Biblioteca,
});

function Biblioteca() {
  const { can } = useFeatureAccess();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<LibraryCategory | "Todas">("Todas");

  const items = useMemo(
    () =>
      LIBRARY_ITEMS.filter(
        (i) =>
          (cat === "Todas" || i.category === cat) &&
          (i.title + i.detail).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, cat],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Biblioteca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Referência técnica de materiais, perfis e processos usados na caldeiraria.
        </p>
      </header>

      <label className="glass flex items-center gap-2 rounded-xl px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item técnico…"
          className="w-full bg-transparent py-2.5 text-sm outline-none"
        />
      </label>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {(["Todas", ...LIBRARY_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 rounded-xl px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
              cat === c
                ? "bg-accent/12 text-accent ring-1 ring-accent/20"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const locked = item.premium && !can("library.full");
          return (
            <Panel key={item.id} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[13px] font-medium">{item.title}</p>
                <PlanBadge premium={item.premium} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
              {locked ? (
                <Link
                  to="/configuracoes"
                  className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-background/40 px-3 py-2.5 font-mono text-[10px] text-muted-foreground"
                >
                  <Lock className="size-3 text-accent" /> Dados no Modo Mestre
                </Link>
              ) : (
                <dl className="mt-3 space-y-1 border-t border-line pt-2 font-mono text-[11px]">
                  {item.data.map((d) => (
                    <div key={d.label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
