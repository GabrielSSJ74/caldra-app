import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Heart, PenTool, Save } from "lucide-react";
import { findPart } from "@/lib/library/registry";
import { defaultValues, getGenerator, visibleFields } from "@/lib/cnc2d/generators";
import { VectorPreview } from "@/components/chameleon/VectorPreview";
import { SmartNumberInput } from "@/components/chameleon/SmartNumberInput";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { sendToLab2D } from "@/lib/lab2d/handoff";
import { markRecent, saveCustom, toggleFavorite, useLibraryState } from "@/lib/library/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracagem/cnc/$id")({
  validateSearch: (raw: Record<string, unknown>): { projeto?: string; peca?: string } => ({
    projeto: typeof raw['projeto'] === "string" ? raw['projeto'] : undefined,
    peca: typeof raw['peca'] === "string" ? raw['peca'] : undefined,
  }),
  loader: ({ params }) => {
    const part = findPart(`cnc.${params.id}`);
    if (!part || !part.generator) throw notFound();
    return { part };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return { meta: [{ title: "Peça indisponível — CALDRA" }, { name: "robots", content: "noindex" }] };
    const { name, summary } = loaderData.part;
    const title = `${name} — CNC 2D CALDRA`;
    return {
      meta: [
        { title },
        { name: "description", content: summary },
        { property: "og:title", content: title },
        { property: "og:description", content: summary },
      ],
    };
  },
  component: CncPartPage,
});

function CncPartPage() {
  const { part } = Route.useLoaderData();
  const navigate = useNavigate();
  const { favorites } = useLibraryState();
  const gen = getGenerator(part.generator!)!;
  const [values, setValues] = useState<Record<string, number>>(() => defaultValues(gen));

  useEffect(() => {
    markRecent(part.id);
  }, [part.id]);

  const fields = visibleFields(gen, values);
  const entities = useMemo(() => {
    try {
      return gen.build(values);
    } catch {
      return [];
    }
  }, [gen, values]);

  const fav = favorites.includes(part.id);

  const openInChamfer = () => {
    if (!entities.length) return;
    sendToLab2D({ name: part.name, entities });
    toast.success("Geometria enviada ao CHAMFER");
    navigate({ to: "/desenho-2d" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/tracagem"
            aria-label="Voltar à biblioteca"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-accent"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <h1 className="mt-1 font-display text-xl font-semibold lg:text-2xl">{part.name}</h1>
          <p className="t-eyebrow">CNC 2D · Vetorial · {part.family}</p>
        </div>
        <button
          onClick={() => toggleFavorite(part.id)}
          aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={fav}
          className="mt-1 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-accent"
        >
          <Heart className={cn("size-4", fav && "fill-accent text-accent")} />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="relative aspect-[4/3] overflow-hidden p-4 lg:aspect-auto lg:min-h-[420px]">
          <span aria-hidden className="grid-bg-fine pointer-events-none absolute inset-0 opacity-30" />
          <VectorPreview entities={entities} className="relative text-foreground" />
          <span className="absolute bottom-3 left-4 t-eyebrow">Vetor 2D · mm</span>
        </Panel>

        <div className="space-y-3">
          <Panel className="p-4">
            <SectionLabel>Parâmetros</SectionLabel>
            <div className="space-y-2.5">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3">
                  <span className="t-caption">{f.label}</span>
                  <SmartNumberInput
                    value={values[f.key] ?? f.def}
                    unit={f.suffix ?? "mm"}
                    ariaLabel={f.label}
                    className="w-32"
                    onChange={(n) =>
                      setValues((v) => ({
                        ...v,
                        [f.key]: Math.min(f.max, Math.max(f.min, Number.isFinite(n) ? n : f.def)),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-2 p-4">
            <SectionLabel>Fabricação</SectionLabel>
            <p className="t-caption">
              Desenho → CHAMFER → validação → DXF CNC. A transferência é vetorial 1:1 em mm.
            </p>
            <button
              onClick={openInChamfer}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/12 px-3 py-2.5 font-mono text-[11px] tracking-wider text-accent uppercase ring-1 ring-accent/25 transition-colors hover:bg-accent/20"
            >
              <PenTool className="size-3.5" /> Abrir no CHAMFER
            </button>
            <button
              onClick={() => {
                saveCustom({ baseId: part.id, name: `Meu ${part.name}`, values });
                toast.success("Salvo em Meus Modelos");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <Save className="size-3.5" /> Salvar em Meus Modelos
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
