import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { findGeometry } from "@/lib/geometry/catalog";
import { SquareToRoundStudio } from "@/components/chameleon/SquareToRoundStudio";
import { GeometryStudio } from "@/components/chameleon/GeometryStudio";
import { getPart, getProject, savePartParameters } from "@/lib/projects/store";

type Search = { projeto?: string; peca?: string };

export const Route = createFileRoute("/tracagem/$slug")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    projeto: typeof raw['projeto'] === "string" ? raw['projeto'] : undefined,
    peca: typeof raw['peca'] === "string" ? raw['peca'] : undefined,
  }),
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
  const { projeto, peca } = Route.useSearch();

  const project = projeto ? getProject(projeto) : null;
  const part = projeto && peca ? getPart(projeto, peca) : null;

  return (
    <div className="space-y-4">
      {project && part && (
        <div className="rounded-xl border border-line bg-background/40 px-3 py-2">
          <p className="t-eyebrow">
            <Link to="/projetos" className="hover:text-accent">
              Projetos
            </Link>{" "}
            /{" "}
            <Link
              to="/projetos/$projectId"
              params={{ projectId: project.id }}
              className="hover:text-accent"
            >
              {project.name}
            </Link>{" "}
            / {part.name}
          </p>
        </div>
      )}
      <Header name={part?.name ?? geometry.name} meta={`${geometry.level} · ${geometry.method}`} />
      {geometry.slug === "quadrado-redondo" ? (
        <SquareToRoundStudio />
      ) : (
        <GeometryStudio
          key={part?.instanceId ?? geometry.slug}
          slug={geometry.slug}
          name={part?.name ?? geometry.name}
          initial={
            part
              ? {
                  values: part.parameters,
                  materialId: part.materialId,
                  material: part.material,
                  quantity: part.quantity,
                }
              : undefined
          }
          onPersist={
            projeto && peca
              ? (snap) =>
                  savePartParameters(projeto, peca, snap.values, {
                    material: snap.material,
                    materialId: snap.materialId,
                    thickness: snap.thickness,
                    quantity: snap.quantity,
                  })
              : undefined
          }
        />
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
