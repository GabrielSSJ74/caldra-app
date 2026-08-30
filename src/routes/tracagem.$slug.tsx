import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, Hammer } from "lucide-react";
import { findGeometry } from "@/lib/geometry/catalog";
import { SquareToRoundStudio } from "@/components/chameleon/SquareToRoundStudio";
import { Panel, StatusBadge } from "@/components/chameleon/ui";

export const Route = createFileRoute("/tracagem/$slug")({
  loader: ({ params }) => {
    const geometry = findGeometry(params.slug);
    if (!geometry) throw notFound();
    return { geometry };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Geometria indisponível — CHAMELEON" }, { name: "robots", content: "noindex" }],
      };
    }
    const { name, short } = loaderData.geometry;
    const title = `${name} — Traçagem CHAMELEON`;
    return {
      meta: [
        { title },
        { name: "description", content: short },
        { property: "og:title", content: title },
        { property: "og:description", content: short },
      ],
    };
  },
  component: GeometryPage,
});

function GeometryPage() {
  const { geometry } = Route.useLoaderData();

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/tracagem"
          className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
        >
          <ChevronLeft className="size-3" /> Traçagem
        </Link>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <svg viewBox="0 0 48 48" className="size-10 shrink-0 text-accent">
              <path
                d={geometry.icon}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-semibold lg:text-2xl">
                {geometry.name}
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground">
                {geometry.level} · {geometry.method}
              </p>
            </div>
          </div>
          <StatusBadge status={geometry.status} />
        </div>
      </div>

      {geometry.slug === "quadrado-redondo" ? (
        <SquareToRoundStudio />
      ) : (
        <Panel className="p-8 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl border border-warn/25 bg-warn/10 text-warn">
            <Hammer className="size-4" />
          </div>
          <h2 className="mt-3 font-display text-base">Módulo em desenvolvimento</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {geometry.short} O motor de cálculo desta geometria está sendo construído sobre a mesma
            base de triangulação já validada na transição quadrado → redondo.
          </p>
          <Link
            to="/tracagem/$slug"
            params={{ slug: "quadrado-redondo" }}
            className="brand-gradient mt-4 inline-block rounded-xl px-4 py-2 text-sm font-semibold text-background"
          >
            Abrir módulo funcional
          </Link>
        </Panel>
      )}
    </div>
  );
}
