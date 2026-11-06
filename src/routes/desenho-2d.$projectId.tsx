import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/chameleon/ui";

const Lab2DEditor = lazy(() =>
  import("@/components/lab2d/Lab2DEditor").then((m) => ({ default: m.Lab2DEditor })),
);

export const Route = createFileRoute("/desenho-2d/$projectId")({
  head: () => ({
    meta: [
      { title: "CHAMFER — CALDRA" },
      {
        name: "description",
        content:
          "Prancheta vetorial em milímetros: snap geométrico, planos, cotas de conferência e exportação DXF/SVG/PNG/PDF.",
      },
      { property: "og:title", content: "CHAMFER — CALDRA" },
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
      title="CHAMFER"
      description="A prancheta vetorial faz parte do Modo Mestre."
    >
      <Suspense fallback={<div className="min-h-screen w-full bg-background" />}>
        <Lab2DEditor projectId={projectId} />
      </Suspense>
    </FeatureGate>
  );
}
