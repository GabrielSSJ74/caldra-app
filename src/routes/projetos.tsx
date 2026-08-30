import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FolderKanban, Lock } from "lucide-react";
import { DEMO_PROJECTS } from "@/lib/projects/demo-data";
import { FREE_PROJECT_LIMIT } from "@/lib/subscription/features";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { DemoTag, Panel, SectionLabel } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projetos")({
  head: () => ({
    meta: [
      { title: "Projetos — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content: "Organize peças, materiais e progresso de cada obra de caldeiraria.",
      },
      { property: "og:title", content: "Projetos — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Acompanhe peças calculadas, rascunhos e exportações por projeto.",
      },
    ],
  }),
  component: Projetos,
});

const STATUS_STYLE = {
  calculada: "bg-accent/10 text-accent",
  rascunho: "bg-warn/10 text-warn",
  exportada: "bg-accent2/10 text-accent2",
} as const;

function Projetos() {
  const { isMestre } = useFeatureAccess();
  const [open, setOpen] = useState(DEMO_PROJECTS[0]!.id);

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">Projetos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMestre
              ? "Projetos ilimitados no Modo Mestre."
              : `Plano Free: até ${FREE_PROJECT_LIMIT} projetos.`}
          </p>
        </div>
        <DemoTag />
      </header>

      <div className="space-y-3">
        {DEMO_PROJECTS.map((p) => {
          const expanded = open === p.id;
          return (
            <Panel key={p.id} className="overflow-hidden">
              <button
                onClick={() => setOpen(expanded ? "" : p.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-medium">{p.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {p.client} · {p.pieces.length} peças ·{" "}
                    {new Date(p.date).toLocaleDateString("pt-BR")}
                  </p>
                  <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
                    <div className="brand-gradient h-full" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                <FolderKanban className="size-5 shrink-0 text-accent" />
              </button>
              {expanded && (
                <div className="fade-up border-t border-line p-4 pt-3">
                  <SectionLabel>Peças</SectionLabel>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="font-mono text-[10px] text-muted-foreground uppercase">
                        <tr>
                          <th className="py-1.5 pr-3 font-normal">Peça</th>
                          <th className="py-1.5 pr-3 font-normal">Dimensões</th>
                          <th className="py-1.5 pr-3 font-normal">Material</th>
                          <th className="py-1.5 pr-3 font-normal">Qtd</th>
                          <th className="py-1.5 font-normal">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.pieces.map((piece) => (
                          <tr key={piece.id} className="border-t border-line">
                            <td className="py-2 pr-3">{piece.name}</td>
                            <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                              {piece.dimensions}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {piece.material} · {piece.thickness} mm
                            </td>
                            <td className="py-2 pr-3 font-mono">{piece.quantity}</td>
                            <td className="py-2">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase",
                                  STATUS_STYLE[piece.status],
                                )}
                              >
                                {piece.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">{p.notes}</p>
                </div>
              )}
            </Panel>
          );
        })}

        {!isMestre && (
          <Panel className="flex items-center gap-3 p-4">
            <Lock className="size-4 shrink-0 text-accent" />
            <p className="text-[12px] text-muted-foreground">
              Limite do plano Free atingido. Ative o Modo Mestre para criar projetos ilimitados com
              peças, materiais e histórico de exportação.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
