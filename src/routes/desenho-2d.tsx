import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/chameleon/ui";
import { Lab2DEditor } from "@/components/lab2d/Lab2DEditor";

export const Route = createFileRoute("/desenho-2d")({
  head: () => ({
    meta: [
      { title: "Laboratório 2D — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Editor vetorial profissional: snap geométrico, camadas, aparar, paralela, concordância e DXF.",
      },
      { property: "og:title", content: "Laboratório 2D — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Prancheta vetorial em escala real com ferramentas de fabricação.",
      },
    ],
  }),
  component: Lab2DPage,
});

function Lab2DPage() {
  return (
    <FeatureGate
      feature="lab2d"
      title="Laboratório 2D"
      description="A prancheta vetorial faz parte do Modo Mestre."
    >
      <Lab2DEditor />
    </FeatureGate>
  );
}
