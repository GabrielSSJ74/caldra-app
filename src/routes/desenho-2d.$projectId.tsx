import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { FeatureGate } from "@/components/chameleon/ui";
import { Lab2DEditor } from "@/components/lab2d/Lab2DEditor";

export const Route = createFileRoute("/desenho-2d/$projectId")({
  head: () => ({
    meta: [
      { title: "Laboratório 2D — CALDRA" },
      {
        name: "description",
        content:
          "Prancheta vetorial em milímetros: snap geométrico, planos, cotas de conferência e exportação DXF/SVG/PNG/PDF.",
      },
      { property: "og:title", content: "Laboratório 2D — CALDRA" },
      {
        property: "og:description",
        content: "Estação CAD de bolso para caldeiraria e corte CNC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Lab2DPage,
});

function Lab2DPage() {
  const { projectId } = Route.useParams();
  return (
    <FeatureGate
      feature="lab2d"
      title="Laboratório 2D"
      description="A prancheta vetorial faz parte do Modo Mestre."
    >
      <div className="space-y-2">
        <Link
          to="/desenho-2d"
          className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-accent"
        >
          <ChevronLeft className="size-3.5" /> Projetos
        </Link>
        <Lab2DEditor projectId={projectId} />
      </div>
    </FeatureGate>
  );
}
