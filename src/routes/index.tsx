import { createFileRoute } from "@tanstack/react-router";
import { WorkshopDashboard } from "@/components/home/WorkshopDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CALDRA — Sua oficina digital" },
      {
        name: "description",
        content:
          "Crie projetos, desenvolva desenhos CAD, calcule materiais, prepare orçamentos e evolua na caldeiraria e na traçagem.",
      },
      { property: "og:title", content: "CALDRA — Sua oficina digital" },
      {
        property: "og:description",
        content:
          "Sua oficina na palma da mão: CAD, criação de projetos, orçamentos e especialização em caldeiraria e traçagem.",
      },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  return <WorkshopDashboard />;
}
