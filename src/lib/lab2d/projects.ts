/**
 * Armazenamento local de projetos e planos do Laboratório 2D.
 * Funciona offline; o autosave grava a cada alteração relevante.
 */

import { DEFAULT_LAYERS, uid, type Entity, type Layer } from "./core";
import type { GroupDef } from "./groups";
import { DEFAULT_DIM_STYLE, type Dimension, type DimRef } from "./dimensions";
import { techColor } from "./technical";
import { sanitizeRevEngPlanData, type RevEngPlanData } from "./revEngTypes";

const KEY = "caldra.lab2d.projects";
const LEGACY_KEY = "chameleon.lab2d.projects";

export type Plan = {
  id: string;
  name: string;
  entities: Entity[];
  visible: boolean;
  locked: boolean;
  /** Grupos do plano (Fase 2A) — a pertinência mora na entidade. */
  groups?: GroupDef[];
  /** Cotas associativas do plano — informação, nunca geometria de fabricação. */
  dims?: Dimension[];
  /** Árvore paramétrica 3D serializada associada ao plano (extrude_sketch vinculado + recursos 3D). */
  cad3dTreeJson?: string;
  /** Dados persistentes de Engenharia Reversa e Bancada Mecânica (schema versionado). */
  revEng?: RevEngPlanData;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plans: Plan[];
  lastPlanId: string;
  layers: Layer[];
  /** Espessura da chapa (mm) — usada pela vista 3D e pela fabricação. */
  thickness?: number;
};

export const DEFAULT_PLAN_THICKNESS = 3;

export const planLabel = (i: number) => `P${String(i + 1).padStart(2, "0")}`;

export function emptyPlan(index = 0): Plan {
  return {
    id: uid(),
    name: planLabel(index),
    entities: [],
    visible: true,
    locked: false,
    groups: [],
  };
}

function sanitizeDimRef(raw: unknown): DimRef | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "entity" || typeof obj.id === "string") {
    if (typeof obj.id !== "string" || !obj.id) return null;
    return {
      kind: "entity",
      id: obj.id,
      ...(typeof obj.anchor === "string"
        ? { anchor: obj.anchor as "center" | "start" | "end" | "mid" }
        : {}),
    };
  }
  const ptSource =
    obj.p && typeof obj.p === "object"
      ? (obj.p as { x?: unknown; y?: unknown })
      : (obj as { x?: unknown; y?: unknown });
  const x = Number(ptSource?.x);
  const y = Number(ptSource?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { kind: "point", p: { x, y } };
  }
  return null;
}

export function sanitizeProject(p: Project): Project {
  const seenPlanIds = new Set<string>();
  const plans = (p.plans && p.plans.length > 0 ? p.plans : [emptyPlan(0)]).map((pl, idx) => {
    let planId = pl.id;
    if (!planId || planId === "draft" || planId.startsWith("draft-") || seenPlanIds.has(planId)) {
      planId = uid();
    }
    seenPlanIds.add(planId);

    const seenEntIds = new Set<string>();
    const entities = (pl.entities ?? []).map((ent) => {
      let entId = ent.id;
      if (!entId || entId === "draft" || entId.startsWith("draft-") || seenEntIds.has(entId)) {
        entId = uid();
      }
      seenEntIds.add(entId);
      return ent.id === entId ? ent : { ...ent, id: entId };
    });

    const sanitizedDims = Array.isArray(pl.dims)
      ? pl.dims
          .map((d): Dimension | null => {
            if (!d || typeof d !== "object" || !Array.isArray(d.refs)) return null;
            const refs = d.refs.map(sanitizeDimRef).filter((r): r is DimRef => r !== null);
            if (refs.length === 0) return null;
            return {
              ...d,
              id: d.id || uid(),
              kind: d.kind || "linear",
              refs,
              offset: typeof d.offset === "number" && Number.isFinite(d.offset) ? d.offset : 20,
              style: { ...DEFAULT_DIM_STYLE, ...(d.style ?? {}) },
              role: "DIMENSION",
            };
          })
          .filter((d): d is Dimension => d !== null)
      : undefined;

    return {
      ...pl,
      id: planId,
      name: pl.name || planLabel(idx),
      entities,
      dims: sanitizedDims,
      revEng: pl.revEng ? sanitizeRevEngPlanData(pl.revEng) : undefined,
    };
  });

  return {
    ...p,
    id: !p.id || p.id === "draft" || p.id.startsWith("draft-") ? uid() : p.id,
    plans,
    lastPlanId: plans.some((x) => x.id === p.lastPlanId) ? p.lastPlanId : plans[0]!.id,
    layers: (p.layers ?? DEFAULT_LAYERS).map((l) => ({ ...l, color: techColor(l.id) })),
  };
}

export function newProject(name: string, entities: Entity[] = []): Project {
  const plan = emptyPlan(0);
  const seenEntIds = new Set<string>();
  plan.entities = entities.map((ent) => {
    let entId = ent.id;
    if (!entId || entId === "draft" || entId.startsWith("draft-") || seenEntIds.has(entId)) {
      entId = uid();
    }
    seenEntIds.add(entId);
    return ent.id === entId ? ent : { ...ent, id: entId };
  });
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

let cachedRaw: string | null = null;
let cachedProjects: Project[] | null = null;
const projectMap = new Map<string, Project>();

export function invalidateProjectsCache(): void {
  cachedRaw = null;
  cachedProjects = null;
  projectMap.clear();
}

export function listProjects(): Project[] {
  try {
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      raw = window.localStorage.getItem(LEGACY_KEY);
      if (raw) {
        try {
          window.localStorage.setItem(KEY, raw);
        } catch {
          /* armazenamento indisponível */
        }
      }
    }
    if (!raw) {
      cachedRaw = null;
      cachedProjects = [];
      projectMap.clear();
      return [];
    }
    // Retorno O(1) instantâneo se a string do localStorage não mudou
    if (cachedProjects && cachedRaw === raw) {
      return cachedProjects;
    }
    const list = JSON.parse(raw) as Project[];
    if (!Array.isArray(list)) return [];
    const sanitized = list
      .map(sanitizeProject)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    cachedRaw = raw;
    cachedProjects = sanitized;
    projectMap.clear();
    for (const p of sanitized) {
      projectMap.set(p.id, p);
    }
    return sanitized;
  } catch {
    return [];
  }
}

function writeAll(list: Project[]) {
  try {
    const raw = JSON.stringify(list);
    window.localStorage.setItem(KEY, raw);
    cachedRaw = raw;
    cachedProjects = list;
    projectMap.clear();
    for (const p of list) {
      projectMap.set(p.id, p);
    }
  } catch {
    /* armazenamento indisponível */
  }
}

const PLAYGROUND_SANDBOX_STORAGE_KEY = "caldra.lab2d.playground_sandbox";
export const PLAYGROUND_SANDBOX_ID = "playground-flange-sandbox";
let playgroundSandboxMemory: Project | null = null;

export function isPlaygroundSandboxId(id: string | undefined | null): boolean {
  return Boolean(id && (id === PLAYGROUND_SANDBOX_ID || id.startsWith("playground-")));
}

export function registerPlaygroundSandboxProject(project: Project): Project {
  const clean: Project = {
    ...project,
    id: PLAYGROUND_SANDBOX_ID,
    updatedAt: Date.now(),
  };
  playgroundSandboxMemory = clean;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(PLAYGROUND_SANDBOX_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* sessionStorage indisponível */
    }
  }
  return clean;
}

function readPlaygroundSandboxProject(id: string): Project | null {
  if (playgroundSandboxMemory && playgroundSandboxMemory.id === id) {
    return playgroundSandboxMemory;
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(PLAYGROUND_SANDBOX_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Project;
        if (parsed && parsed.id === id) {
          playgroundSandboxMemory = parsed;
          return parsed;
        }
      }
    } catch {
      /* ignora erro de leitura */
    }
  }
  return null;
}

export function getProject(id: string): Project | null {
  if (isPlaygroundSandboxId(id)) {
    return readPlaygroundSandboxProject(id);
  }
  // Procura diretamente no mapa em memória primeiro para resposta imediata em 0ms
  if (projectMap.has(id)) {
    return projectMap.get(id)!;
  }
  return listProjects().find((p) => p.id === id) ?? null;
}

export function preloadProject(id: string): Project | null {
  return getProject(id);
}

export function saveProject(project: Project) {
  if (isPlaygroundSandboxId(project.id)) {
    registerPlaygroundSandboxProject(project);
    return;
  }
  const list = listProjects().filter((p) => p.id !== project.id);
  writeAll([{ ...project, updatedAt: Date.now() }, ...list]);
}

export function deleteProject(id: string) {
  if (isPlaygroundSandboxId(id)) {
    playgroundSandboxMemory = null;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(PLAYGROUND_SANDBOX_STORAGE_KEY);
      } catch {
        /* ignora */
      }
    }
    return;
  }
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
