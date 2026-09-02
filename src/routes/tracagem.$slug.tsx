import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { findGeometry } from "@/lib/geometry/catalog";
import { SquareToRoundStudio } from "@/components/chameleon/SquareToRoundStudio";
import { GeometryStudio } from "@/components/chameleon/GeometryStudio";


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

function GeometryPage() {
  const { geometry } = Route.useLoaderData();

  return (
    <div className="space-y-4">
      <Header name={geometry.name} meta={`${geometry.level} · ${geometry.method}`} />
      {geometry.slug === "quadrado-redondo" ? (
        <SquareToRoundStudio />
      ) : (
        <GeometryStudio slug={geometry.slug} name={geometry.name} />
      )}
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
