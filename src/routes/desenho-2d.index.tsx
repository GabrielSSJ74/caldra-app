import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, FolderOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { FeatureGate } from "@/components/chameleon/ui";
import { takeHandoff } from "@/lib/lab2d/handoff";
import {
  countEntities,
  deleteProject,
  duplicateProject,
  listProjects,
  newProject,
  renameProject,
  saveProject,
  type Project,
} from "@/lib/lab2d/projects";

export const Route = createFileRoute("/desenho-2d/")({
  head: () => ({
    meta: [
      { title: "Projetos 2D — CALDRA" },
      {
        name: "description",
        content:
          "Explorador de projetos do CHAMFER: planos, autosave local e abertura direta na prancheta vetorial.",
      },
      { property: "og:title", content: "Projetos 2D — CALDRA" },
      {
        property: "og:description",
        content: "Organize projetos e planos de caldeiraria antes de desenhar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExplorerPage,
});

function ExplorerPage() {
  return (
    <FeatureGate
      feature="lab2d"
      title="CHAMFER"
      description="A prancheta vetorial faz parte do Modo Mestre."
    >
      <Explorer />
    </FeatureGate>
  );
}

function Explorer() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");

  const refresh = () => setProjects(listProjects());

  useEffect(() => {
    const handoff = takeHandoff();
    if (handoff) {
      const p = newProject(handoff.name, handoff.entities);
      saveProject(p);
      toast.success(`${handoff.name} recebido da Traçagem.`);
      void navigate({ to: "/desenho-2d/$projectId", params: { projectId: p.id } });
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );

  const create = () => {
    const name = window.prompt("Nome do projeto", `Projeto ${String(projects.length + 1).padStart(2, "0")}`);
    if (name === null) return;
    const p = newProject(name);
    saveProject(p);
    void navigate({ to: "/desenho-2d/$projectId", params: { projectId: p.id } });
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Projetos</h1>
        <button
          onClick={create}
          className="brand-gradient ml-auto flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-mono text-[10px] tracking-[0.18em] text-background uppercase transition-transform active:scale-95"
        >
          <Plus className="size-3.5" /> Novo
        </button>
      </header>

      <label className="metal flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar projeto"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="py-16 text-center font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Nenhum projeto
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((p) => (
            <li key={p.id} className="metal group rounded-2xl p-3 transition-all hover:amber-ring">
              <button
                onClick={() => navigate({ to: "/desenho-2d/$projectId", params: { projectId: p.id } })}
                className="flex w-full items-center gap-3 text-left"
              >
                <FolderOpen className="size-5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block font-mono text-[10px] tracking-wider text-muted-foreground">
                    {p.plans.length} planos · {countEntities(p)} objetos ·{" "}
                    {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                  </span>
                </span>
              </button>
              <div className="mt-2 flex justify-end gap-1">
                <Action
                  label="Renomear"
                  icon={Pencil}
                  onClick={() => {
                    const name = window.prompt("Novo nome", p.name);
                    if (name === null) return;
                    renameProject(p.id, name);
                    refresh();
                  }}
                />
                <Action
                  label="Duplicar"
                  icon={Copy}
                  onClick={() => {
                    duplicateProject(p.id);
                    refresh();
                    toast.success("Projeto duplicado.");
                  }}
                />
                <Action
                  label="Excluir"
                  icon={Trash2}
                  onClick={() => {
                    if (!window.confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) return;
                    deleteProject(p.id);
                    refresh();
                    toast("Projeto excluído.");
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Action({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-all hover:text-accent active:scale-90"
    >
      <Icon className="size-3.5" />
    </button>
  );
}
