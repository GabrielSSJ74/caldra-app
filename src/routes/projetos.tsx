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
      { title: "Projetos — CALDRA" },
      {
        name: "description",
        content: "Organize peças, materiais e progresso de cada obra de caldeiraria.",
      },
      { property: "og:title", content: "Projetos — CALDRA" },
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

function Thumb({ seed }: { seed: number }) {
  const r = 12 + (seed % 3) * 4;
  return (
    <svg viewBox="0 0 56 56" className="size-full text-muted-foreground" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="6" y="6" width="44" height="44" rx="3" opacity=".35" />
        <circle cx="28" cy="28" r={r} />
        <circle cx="28" cy="28" r={r / 2.4} opacity=".6" />
        <path d="M6 28 H50 M28 6 V50" stroke="var(--accent)" strokeWidth=".5" opacity=".5" />
      </g>
    </svg>
  );
}

function Projetos() {
  const { isMestre } = useFeatureAccess();
  const [open, setOpen] = useState(DEMO_PROJECTS[0]!.id);

  return (
    <div className="space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pt-1">
        <div className="min-w-0">
          <span className="tick-label">
            {isMestre ? "Mestre · ilimitado" : `Free · até ${FREE_PROJECT_LIMIT}`}
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight">PROJETOS</h1>
        </div>
        <DemoTag />
      </header>

      <div className="space-y-2">
        {DEMO_PROJECTS.map((p, i) => {
          const expanded = open === p.id;
          return (
            <Panel key={p.id} className="metal overflow-hidden rounded-2xl">
              <button
                onClick={() => setOpen(expanded ? "" : p.id)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left"
              >
                <span
                  className={cn(
                    "size-12 shrink-0 rounded-xl p-1 transition-all duration-500",
                    expanded ? "bg-accent/8 amber-ring" : "hairline",
                  )}
                >
                  <Thumb seed={i} />
                </span>
                <div className="min-w-0">
                  <span className="tick-label">Projeto {String(i + 1).padStart(2, "0")}</span>
                  <p className="truncate font-display text-[15px] font-medium">{p.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {p.pieces.length} planos · {new Date(p.date).toLocaleDateString("pt-BR")}
                  </p>
                  <div className="mt-2 h-px w-full max-w-xs overflow-hidden bg-border">
                    <div className="h-full bg-accent" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[11px] text-accent">{p.progress}%</span>
                  <FolderKanban className="size-4 text-muted-foreground" strokeWidth={1.4} />
                </span>
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
              Limite do plano Free atingido ({FREE_PROJECT_LIMIT} projetos).{" "}
              <button
                onClick={() => requirePro("projects.unlimited")}
                className="text-accent underline"
              >
                Liberar projetos ilimitados
              </button>{" "}
              com peças, materiais e histórico de exportação.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
