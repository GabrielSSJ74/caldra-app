/**
 * Armazenamento local de projetos e planos do Laboratório 2D.
 * Funciona offline; o autosave grava a cada alteração relevante.
 */

import { DEFAULT_LAYERS, uid, type Entity, type Layer } from "./core";

const KEY = "chameleon.lab2d.projects";

export type Plan = {
  id: string;
  name: string;
  entities: Entity[];
  visible: boolean;
  locked: boolean;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plans: Plan[];
  lastPlanId: string;
  layers: Layer[];
};

export const planLabel = (i: number) => `P${String(i + 1).padStart(2, "0")}`;

export function emptyPlan(index = 0): Plan {
  return { id: uid(), name: planLabel(index), entities: [], visible: true, locked: false };
}

export function newProject(name: string, entities: Entity[] = []): Project {
  const plan = emptyPlan(0);
  plan.entities = entities;
  return {
    id: uid(),
    name: name.trim() || "Projeto",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    plans: [plan],
    lastPlanId: plan.id,
    layers: DEFAULT_LAYERS,
  };
}

export function listProjects(): Project[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Project[];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Project[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* armazenamento indisponível */
  }
}

export function getProject(id: string): Project | null {
  return listProjects().find((p) => p.id === id) ?? null;
}

export function saveProject(project: Project) {
  const list = listProjects().filter((p) => p.id !== project.id);
  writeAll([{ ...project, updatedAt: Date.now() }, ...list]);
}

export function deleteProject(id: string) {
  writeAll(listProjects().filter((p) => p.id !== id));
}

export function duplicateProject(id: string): Project | null {
  const src = getProject(id);
  if (!src) return null;
  const copy: Project = {
    ...structuredClone(src),
    id: uid(),
    name: `${src.name} (cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  copy.plans = copy.plans.map((p) => ({ ...p, id: uid() }));
  copy.lastPlanId = copy.plans[0]?.id ?? "";
  saveProject(copy);
  return copy;
}

export function renameProject(id: string, name: string) {
  const p = getProject(id);
  if (!p) return;
  saveProject({ ...p, name: name.trim() || p.name });
}

export const countEntities = (p: Project) =>
  p.plans.reduce((acc, pl) => acc + pl.entities.length, 0);
