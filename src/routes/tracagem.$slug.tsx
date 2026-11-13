import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { GeometryStudio } from "@/components/chameleon/GeometryStudio";
import { SquareToRoundStudio } from "@/components/chameleon/SquareToRoundStudio";
import { findGeometry } from "@/lib/geometry/catalog";
import { getCustom } from "@/lib/library/store";
import { getPart, getProject, savePartParameters } from "@/lib/projects/store";

type Search = {
  projeto?: string | undefined;
  peca?: string | undefined;
  preset?: string | undefined;
  modelo?: string | undefined;
};

/** "gomos:3,ang:90" → { gomos: 3, ang: 90 } (compatibilidade de modelos antigos). */
function parsePreset(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [k, val] = part.split(":");
    const n = Number(val);
    if (k && Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

export const Route = createFileRoute("/tracagem/$slug")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    projeto: typeof raw["projeto"] === "string" ? raw["projeto"] : undefined,
    peca: typeof raw["peca"] === "string" ? raw["peca"] : undefined,
    preset: typeof raw["preset"] === "string" ? raw["preset"] : undefined,
    modelo: typeof raw["modelo"] === "string" ? raw["modelo"] : undefined,
  }),

  loader: ({ params }) => {
    const geometry = findGeometry(params.slug);
    if (!geometry) throw notFound();
    return { geometry };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Geometria indisponível — CALDRA" },
          { name: "robots", content: "noindex" },
        ],
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
  const { projeto, peca, preset, modelo } = Route.useSearch();

  const project = projeto ? getProject(projeto) : null;
  const part = projeto && peca ? getPart(projeto, peca) : null;
  const custom = modelo ? getCustom(modelo) : undefined;

  return (
    <div className="space-y-4 pb-[calc(135px+env(safe-area-inset-bottom))]">
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
      <Header name={part?.name ?? geometry.name} meta={`${geometry.level} • ${geometry.method}`} />
      {geometry.slug === "quadrado-redondo" ? (
        <SquareToRoundStudio
          initialValues={custom?.values}
          customId={custom?.id}
          customName={custom?.name}
        />
      ) : (
        <GeometryStudio
          key={part?.instanceId ?? geometry.slug}
          slug={geometry.slug}
          name={part?.name ?? geometry.name}
          preset={{ ...(parsePreset(preset) ?? {}), ...(custom?.values ?? {}) }}
          customId={custom?.id}
          customName={custom?.name}
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

/**
 * Região A — Cabeçalho Técnico da Seção (Compacto e Alinhado).
 * Botão de retorno >= 44px, título principal 22px extra-bold #F8FAFC e subtítulo técnico em caixa alta.
 */
function Header({ name, meta }: { name: string; meta: string }) {
  return (
    <header
      data-testid="section-technical-header"
      className="flex items-center gap-3 rounded-2xl border border-slate-400/15 bg-[#11192B]/90 px-3 py-2.5 shadow-sm"
    >
      <Link
        to="/tracagem"
        aria-label="Voltar à galeria"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-400/20 bg-[#0B1120] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-sky-300"
      >
        <ChevronLeft className="size-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[22px] leading-tight font-extrabold text-[#F8FAFC]">
          {name}
        </h1>
        <p className="mt-0.5 truncate font-mono text-[10px] font-semibold tracking-[0.14em] text-sky-300/90 uppercase">
          {meta}
        </p>
      </div>
    </header>
  );
}
