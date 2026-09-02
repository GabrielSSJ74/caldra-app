import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { findGeometry } from "@/lib/geometry/catalog";
import { buildWire, DEFAULT_PARAMS, type WireParams } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { SquareToRoundStudio } from "@/components/chameleon/SquareToRoundStudio";

export const Route = createFileRoute("/tracagem/$slug")({
  loader: ({ params }) => {
    const geometry = findGeometry(params.slug);
    if (!geometry) throw notFound();
    return { geometry };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Geometria indisponível — CALDRA" }, { name: "robots", content: "noindex" }],
      };
    }
    const { name, short } = loaderData.geometry;
    const title = `${name} — Traçagem CALDRA`;
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

const SLIDERS: { key: keyof WireParams; label: string; min: number; max: number }[] = [
  { key: "d1", label: "Ø / lado maior", min: 60, max: 900 },
  { key: "d2", label: "Ø / lado menor", min: 40, max: 700 },
  { key: "h", label: "Altura", min: 40, max: 900 },
  { key: "e", label: "Excentricidade", min: 0, max: 300 },
];

function GeometryPage() {
  const { geometry } = Route.useLoaderData();
  const [params, setParams] = useState<WireParams>(DEFAULT_PARAMS);
  const [unfold, setUnfold] = useState(0);

  if (geometry.slug === "quadrado-redondo")
    return (
      <div className="space-y-4">
        <Header name={geometry.name} meta={`${geometry.level} · ${geometry.method}`} />
        <SquareToRoundStudio />
      </div>
    );

  return (
    <div className="space-y-4">
      <Header name={geometry.name} meta={`${geometry.level} · ${geometry.method}`} />

      <div className="glass grid-bg-fine relative overflow-hidden rounded-3xl">
        <Wire3D
          interactive
          unfold={unfold}
          model={buildWire(geometry.slug, params)}
          className="h-[46vh] min-h-[300px] w-full text-foreground/80"
        />
        <div className="absolute inset-x-4 bottom-3 flex items-center gap-3">
          <span className="font-mono text-[9px] text-muted-foreground uppercase">3D</span>
          <input
            type="range"
            min={0}
            max={100}
            value={unfold * 100}
            onChange={(e) => setUnfold(Number(e.target.value) / 100)}
            aria-label="Abrir peça"
            className="h-1 flex-1 accent-[var(--accent)]"
          />
          <span className="font-mono text-[9px] text-muted-foreground uppercase">2D</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SLIDERS.map((s) => (
          <label key={s.key} className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
            <span className="font-mono text-[9px] text-muted-foreground uppercase">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              value={Number(params[s.key] ?? 0)}
              onChange={(e) => setParams((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
              className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-9 text-right font-mono text-[10px]">{params[s.key] ?? 0}</span>
          </label>
        ))}
      </div>

      <Link
        to="/tracagem/$slug"
        params={{ slug: "quadrado-redondo" }}
        className="glass block rounded-2xl px-4 py-3 text-center font-mono text-[10px] tracking-[0.2em] text-accent uppercase"
      >
        Motor de cálculo ativo · Quadrado → Redondo
      </Link>
    </div>
  );
}

function Header({ name, meta }: { name: string; meta: string }) {
  return (
    <div>
      <Link
        to="/tracagem"
        aria-label="Voltar à galeria"
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-accent"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <h1 className="mt-1 font-display text-xl font-semibold lg:text-2xl">{name}</h1>
      <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {meta}
      </p>
    </div>
  );
}
