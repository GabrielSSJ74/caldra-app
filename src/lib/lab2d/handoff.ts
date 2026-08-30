import type { DevelopmentPattern } from "@/lib/geometry/types";
import { uid, type Entity } from "./core";

const KEY = "chameleon.lab2d.handoff";

export type Handoff = { name: string; entities: Entity[] };

/** Converte um desenvolvimento calculado na Traçagem em entidades editáveis. */
export function developmentToEntities(dev: DevelopmentPattern): Entity[] {
  const out: Entity[] = [
    {
      id: uid(),
      layer: "corte",
      type: "polyline",
      closed: true,
      pts: dev.outline.map((p) => ({ x: p.x, y: p.y })),
    },
  ];
  for (const f of dev.foldLines)
    out.push({
      id: uid(),
      layer: "dobra",
      type: "line",
      x1: f.a.x,
      y1: f.a.y,
      x2: f.b.x,
      y2: f.b.y,
    });
  return out;
}

export function sendToLab2D(payload: Handoff) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage indisponível */
  }
}

export function takeHandoff(): Handoff | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    return JSON.parse(raw) as Handoff;
  } catch {
    return null;
  }
}
