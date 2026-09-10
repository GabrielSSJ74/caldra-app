/**
 * PROJETOS — dossiê de fabricação (cliente / obra / ordem).
 *
 * Um PROJETO é um pacote de trabalho; cada PEÇA é uma INSTÂNCIA independente
 * de um modelo da biblioteca de Traçagem (`PartModel`). O modelo global nunca
 * é alterado: a instância guarda seus próprios parâmetros, material,
 * espessura, quantidade, status e histórico.
 *
 *   PartModel (registry)  →  Project  →  ProjectPart (instância)
 *
 * Persistência local (offline-first), com autosave inteligente feito pelos
 * chamadores (debounce) — este módulo apenas grava o estado recebido.
 */

import { useSyncExternalStore } from "react";
import { findPart } from "@/lib/library/registry";

const KEY = "caldra.projects.v1";

export type ProjectType = "cliente" | "obra" | "industrial" | "interno" | "outro";

export type ProjectStatus =
  | "rascunho"
  | "em-desenvolvimento"
  | "em-producao"
  | "parcial"
  | "concluido"
  | "entregue";

export type PartStatus =
  | "rascunho"
  | "calculada"
  | "em-revisao"
  | "validada"
  | "exportada"
  | "em-producao"
  | "finalizada"
  | "entregue";

/** CONJUNTO — escada, plataforma, guarda-corpo, linha de tubulação… */
export type Assembly = {
  id: string;
  /** sufixo do código, ex.: "EST" em ESC-EST. */
  code: string;
  name: string;
  description?: string | undefined;
  order: number;
};

/** SUBCONJUNTO — pertence sempre a um conjunto. */
export type Subassembly = {
  id: string;
  assemblyId: string;
  code: string;
  name: string;
  description?: string | undefined;
  order: number;
};

export type ProjectPart = {
  instanceId: string;
  /** referência ao modelo global da biblioteca (nunca uma cópia dele). */
  modelId: string;
  /** identidade única no projeto, ex.: ESC-EST-001. */
  code: string;
  name: string;
  parameters: Record<string, number>;
  materialId?: string | undefined;
  material: string;
  thickness: number;
  quantity: number;
  status: PartStatus;
  /** 0–100; derivado do status quando não editado manualmente. */
  progress?: number | undefined;
  notes: string;
  /** vínculo estrutural (opcional: peça avulsa continua válida). */
  assemblyId?: string | undefined;
  subassemblyId?: string | undefined;
  /** função da peça no conjunto (longarina, degrau, chapa de base…). */
  role?: string | undefined;
  /** posição / ordem de montagem dentro do conjunto. */
  position?: string | undefined;
  /** revisão corrente da peça: A, B, C… */
  revision: string;
  createdAt: number;
  updatedAt: number;
  /** estrutura reservada para versionamento futuro. */
  version: number;
};

export type HistoryEvent = { at: number; text: string };

export type Project = {
  id: string;
  name: string;
  client: string;
  description: string;
  type: ProjectType;
  owner?: string | undefined;
  place?: string | undefined;
  deadline?: string | undefined;
  /** identidade única do projeto, ex.: ESC-001. */
  code?: string | undefined;
  revision: string;
  tags?: string[] | undefined;
  status: ProjectStatus;
  /** marcado manualmente pelo usuário. */
  delivered: boolean;
  notes: string;
  assemblies: Assembly[];
  subassemblies: Subassembly[];
  parts: ProjectPart[];
  history: HistoryEvent[];
  createdAt: number;
  updatedAt: number;
};

/* ------------------------------------------------------------------ */
/* Códigos — identidade única (ESC-001 / ESC-EST / ESC-EST-001)        */
/* ------------------------------------------------------------------ */

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "para", "com", "em", "a", "o"]);

function slugToken(text: string, size = 3): string {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  if (!clean.length) return "GEN";
  if (clean.length >= size) return clean.slice(0, size).map((w) => w[0]).join("");
  return clean[0]!.slice(0, size).padEnd(Math.min(size, clean[0]!.length), "");
}

const seq = (n: number) => String(n).padStart(3, "0");

export function nextRevision(rev: string): string {
  const c = (rev || "A").toUpperCase().charCodeAt(0);
  return c >= 90 ? "A1" : String.fromCharCode(c + 1);
}

function makeProjectCode(name: string, taken: Set<string>): string {
  const base = slugToken(name);
  let i = 1;
  while (taken.has(`${base}-${seq(i)}`)) i += 1;
  return `${base}-${seq(i)}`;
}

function makeAssemblyCode(name: string, taken: Set<string>): string {
  const base = slugToken(name);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

/** Código de peça derivado do conjunto (ou do projeto, quando avulsa). */
export function makePartCode(project: Project, assemblyId?: string): string {
  const asm = project.assemblies.find((a) => a.id === assemblyId);
  const prefix = asm
    ? `${project.code ?? slugToken(project.name)}-${asm.code}`
    : `${project.code ?? slugToken(project.name)}-P`;
  const taken = new Set(project.parts.map((p) => p.code));
  let i = 1;
  while (taken.has(`${prefix}-${seq(i)}`)) i += 1;
  return `${prefix}-${seq(i)}`;
}


/* ------------------------------------------------------------------ */
/* Progresso — determinístico, ponderado pela quantidade               */
/* ------------------------------------------------------------------ */

const STATUS_WEIGHT: Record<PartStatus, number> = {
  rascunho: 0,
  calculada: 0.3,
  "em-revisao": 0.45,
  validada: 0.6,
  exportada: 0.75,
  "em-producao": 0.9,
  finalizada: 1,
  entregue: 1,
};

export const PART_STATUS_LABEL: Record<PartStatus, string> = {
  rascunho: "Rascunho",
  calculada: "Calculada",
  "em-revisao": "Em revisão",
  validada: "Validada",
  exportada: "Exportada",
  "em-producao": "Em produção",
  finalizada: "Finalizada",
  entregue: "Entregue",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  rascunho: "Rascunho",
  "em-desenvolvimento": "Em desenvolvimento",
  "em-producao": "Em produção",
  parcial: "Parcialmente concluído",
  concluido: "Concluído",
  entregue: "Entregue",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  cliente: "Cliente",
  obra: "Obra",
  industrial: "Industrial",
  interno: "Interno",
  outro: "Outro",
};

export function partProgress(part: ProjectPart): number {
  if (typeof part.progress === "number") return clampPct(part.progress);
  return Math.round(STATUS_WEIGHT[part.status] * 100);
}

export function projectProgress(project: Project): number {
  if (!project.parts.length) return 0;
  let total = 0;
  let done = 0;
  for (const p of project.parts) {
    const q = Math.max(1, p.quantity || 1);
    total += q;
    done += (partProgress(p) / 100) * q;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

/** Status derivado do estado real das peças (o "entregue" é manual). */
export function derivedStatus(project: Project): ProjectStatus {
  if (project.delivered) return "entregue";
  if (!project.parts.length) return "rascunho";
  const pct = projectProgress(project);
  if (pct >= 100) return "concluido";
  if (project.parts.some((p) => p.status === "finalizada" || p.status === "entregue"))
    return "parcial";
  if (project.parts.some((p) => p.status === "em-producao")) return "em-producao";
  if (pct === 0) return "rascunho";
  return "em-desenvolvimento";
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

type State = { projects: Project[] };

const EMPTY: State = { projects: [] };

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type PartDraft = { [K in keyof ProjectPart]?: ProjectPart[K] | undefined };
type ProjectDraft = { [K in keyof Project]?: Project[K] | undefined };

function normalizePart(raw: PartDraft): ProjectPart {
  const now = Date.now();
  return {
    instanceId: raw.instanceId ?? uid("pt"),
    modelId: raw.modelId ?? "",
    code: raw.code ?? "",
    name: raw.name ?? "Peça",
    parameters: raw.parameters ?? {},
    materialId: raw.materialId,
    material: raw.material ?? "Aço Carbono",
    thickness: typeof raw.thickness === "number" ? raw.thickness : 3,
    quantity: typeof raw.quantity === "number" ? Math.max(1, raw.quantity) : 1,
    status: raw.status ?? "rascunho",
    progress: typeof raw.progress === "number" ? raw.progress : undefined,
    notes: raw.notes ?? "",
    assemblyId: raw.assemblyId,
    subassemblyId: raw.subassemblyId,
    role: raw.role,
    position: raw.position,
    revision: raw.revision ?? "A",
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    version: raw.version ?? 1,
  };
}

/** Migração segura: campos ausentes recebem padrões, nada é descartado. */
function normalizeProject(raw: ProjectDraft, takenCodes?: Set<string>): Project {
  const now = Date.now();
  const name = raw.name ?? "Projeto";
  const project: Project = {
    id: raw.id ?? uid("pj"),
    name,
    client: raw.client ?? "",
    description: raw.description ?? "",
    type: raw.type ?? "cliente",
    owner: raw.owner,
    place: raw.place,
    deadline: raw.deadline,
    code: raw.code ?? makeProjectCode(name, takenCodes ?? new Set()),
    revision: raw.revision ?? "A",
    tags: raw.tags ?? [],
    status: raw.status ?? "rascunho",
    delivered: raw.delivered ?? false,
    notes: raw.notes ?? "",
    assemblies: (raw.assemblies ?? []).map((a, i) => ({ ...a, order: a.order ?? i })),
    subassemblies: (raw.subassemblies ?? []).map((s, i) => ({ ...s, order: s.order ?? i })),
    parts: (raw.parts ?? []).map(normalizePart),
    history: raw.history ?? [],
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
  takenCodes?.add(project.code!);
  // peças antigas não têm código: recebem um agora, de forma estável.
  for (const part of project.parts) {
    if (!part.code) part.code = makePartCode(project, part.assemblyId);
  }
  return project;
}


function load(): State {
  if (loaded) return state;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      const taken = new Set<string>();
      state = { projects: (parsed.projects ?? []).map((p) => normalizeProject(p, taken)) };

    } else {
      state = { projects: [seedProject()] };
      persist(state);
    }
  } catch {
    state = EMPTY;
  }
  return state;
}

function persist(next: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível */
  }
}

function commit(next: State) {
  state = next;
  persist(next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = (): State => (typeof window === "undefined" ? EMPTY : load());

export function useProjects(): Project[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY).projects;
}

export function useProject(id: string): Project | null {
  const projects = useProjects();
  return projects.find((p) => p.id === id) ?? null;
}

export function listProjects(): Project[] {
  return snapshot().projects;
}

export function getProject(id: string): Project | null {
  return listProjects().find((p) => p.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Operações de projeto                                                */
/* ------------------------------------------------------------------ */

function touch(project: Project, event?: string): Project {
  const now = Date.now();
  const history = event ? [{ at: now, text: event }, ...project.history].slice(0, 200) : project.history;
  const next = { ...project, updatedAt: now, history };
  return { ...next, status: derivedStatus(next) };
}

function replace(project: Project) {
  const s = load();
  commit({ projects: s.projects.map((p) => (p.id === project.id ? project : p)) });
}

export function updateProject(id: string, patch: Partial<Project>, event?: string) {
  const p = getProject(id);
  if (!p) return;
  replace(touch({ ...p, ...patch, id: p.id }, event));
}

export type NewProjectInput = {
  name: string;
  client?: string;
  description?: string;
  type?: ProjectType;
  owner?: string | undefined;
  place?: string | undefined;
  deadline?: string | undefined;
  notes?: string;
};

export function createProject(input: NewProjectInput): Project {
  const now = Date.now();
  const s = load();
  const taken = new Set(s.projects.map((p) => p.code ?? "").filter(Boolean));
  const project = normalizeProject(
    {
      name: input.name.trim() || "Novo projeto",
      client: input.client?.trim() ?? "",
      description: input.description?.trim() ?? "",
      type: input.type ?? "cliente",
      owner: input.owner?.trim() || undefined,
      place: input.place?.trim() || undefined,
      deadline: input.deadline?.trim() || undefined,
      notes: input.notes?.trim() ?? "",
      history: [{ at: now, text: "Projeto criado" }],
      createdAt: now,
      updatedAt: now,
    },
    taken,
  );
  commit({ projects: [project, ...s.projects] });
  return project;
}

/* ------------------------------------------------------------------ */
/* Conjuntos e subconjuntos                                            */
/* ------------------------------------------------------------------ */

export function addAssembly(projectId: string, name: string, description?: string): Assembly | null {
  const project = getProject(projectId);
  if (!project) return null;
  const clean = name.trim() || "Conjunto";
  const asm: Assembly = {
    id: uid("as"),
    code: makeAssemblyCode(clean, new Set(project.assemblies.map((a) => a.code))),
    name: clean,
    description: description?.trim() || undefined,
    order: project.assemblies.length,
  };
  replace(touch({ ...project, assemblies: [...project.assemblies, asm] }, `Conjunto "${clean}" criado`));
  return asm;
}

export function renameAssembly(projectId: string, assemblyId: string, name: string) {
  const project = getProject(projectId);
  if (!project) return;
  const clean = name.trim();
  if (!clean) return;
  replace(
    touch(
      {
        ...project,
        assemblies: project.assemblies.map((a) => (a.id === assemblyId ? { ...a, name: clean } : a)),
      },
      `Conjunto renomeado para "${clean}"`,
    ),
  );
}

/** Remove o conjunto; as peças permanecem no projeto, apenas sem vínculo. */
export function removeAssembly(projectId: string, assemblyId: string) {
  const project = getProject(projectId);
  if (!project) return;
  const asm = project.assemblies.find((a) => a.id === assemblyId);
  const subs = project.subassemblies.filter((s) => s.assemblyId === assemblyId).map((s) => s.id);
  replace(
    touch(
      {
        ...project,
        assemblies: project.assemblies.filter((a) => a.id !== assemblyId),
        subassemblies: project.subassemblies.filter((s) => s.assemblyId !== assemblyId),
        parts: project.parts.map((p) =>
          p.assemblyId === assemblyId || (p.subassemblyId && subs.includes(p.subassemblyId))
            ? { ...p, assemblyId: undefined, subassemblyId: undefined }
            : p,
        ),
      },
      asm ? `Conjunto "${asm.name}" removido` : undefined,
    ),
  );
}

export function addSubassembly(
  projectId: string,
  assemblyId: string,
  name: string,
): Subassembly | null {
  const project = getProject(projectId);
  if (!project) return null;
  const asm = project.assemblies.find((a) => a.id === assemblyId);
  if (!asm) return null;
  const clean = name.trim() || "Subconjunto";
  const siblings = project.subassemblies.filter((s) => s.assemblyId === assemblyId);
  const sub: Subassembly = {
    id: uid("sb"),
    assemblyId,
    code: makeAssemblyCode(clean, new Set(siblings.map((s) => s.code))),
    name: clean,
    order: siblings.length,
  };
  replace(
    touch(
      { ...project, subassemblies: [...project.subassemblies, sub] },
      `Subconjunto "${clean}" criado em ${asm.name}`,
    ),
  );
  return sub;
}

export function removeSubassembly(projectId: string, subassemblyId: string) {
  const project = getProject(projectId);
  if (!project) return;
  const sub = project.subassemblies.find((s) => s.id === subassemblyId);
  replace(
    touch(
      {
        ...project,
        subassemblies: project.subassemblies.filter((s) => s.id !== subassemblyId),
        parts: project.parts.map((p) =>
          p.subassemblyId === subassemblyId ? { ...p, subassemblyId: undefined } : p,
        ),
      },
      sub ? `Subconjunto "${sub.name}" removido` : undefined,
    ),
  );
}

/** Move a peça para outro conjunto/subconjunto e recodifica sua identidade. */
export function assignPart(
  projectId: string,
  instanceId: string,
  assemblyId?: string,
  subassemblyId?: string,
) {
  const project = getProject(projectId);
  if (!project) return;
  const part = project.parts.find((p) => p.instanceId === instanceId);
  if (!part) return;
  const asm = project.assemblies.find((a) => a.id === assemblyId);
  const code = makePartCode(project, assemblyId);
  const next: ProjectPart = {
    ...part,
    assemblyId: assemblyId ?? undefined,
    subassemblyId: subassemblyId ?? undefined,
    code,
    updatedAt: Date.now(),
  };
  replace(
    touch(
      { ...project, parts: project.parts.map((p) => (p.instanceId === instanceId ? next : p)) },
      asm ? `${next.code} vinculada a ${asm.name}` : `${next.code} sem conjunto`,
    ),
  );
}

/** Registra uma nova revisão da peça (REV A → REV B). */
export function bumpPartRevision(projectId: string, instanceId: string, reason?: string) {
  withPart(
    projectId,
    instanceId,
    (p) => ({ ...p, revision: nextRevision(p.revision), version: p.version + 1 }),
    (p) => `${p.code} passou para REV ${p.revision}${reason ? ` — ${reason}` : ""}`,
  );
}


export function renameProject(id: string, name: string) {
  const p = getProject(id);
  if (!p) return;
  const clean = name.trim();
  if (!clean || clean === p.name) return;
  replace(touch({ ...p, name: clean }, `Projeto renomeado para "${clean}"`));
}

export function duplicateProject(id: string): Project | null {
  const src = getProject(id);
  if (!src) return null;
  const now = Date.now();
  const copy: Project = {
    ...structuredClone(src),
    id: uid("pj"),
    name: `${src.name} (cópia)`,
    createdAt: now,
    updatedAt: now,
    delivered: false,
    history: [{ at: now, text: `Duplicado de "${src.name}"` }],
    parts: src.parts.map((p) => ({
      ...structuredClone(p),
      instanceId: uid("pt"),
      createdAt: now,
      updatedAt: now,
      version: 1,
    })),
  };
  const s = load();
  copy.code = makeProjectCode(
    src.name,
    new Set(s.projects.map((p) => p.code ?? "").filter(Boolean)),
  );
  copy.parts = copy.parts.map((p) => ({ ...p, code: p.code.replace(src.code ?? "", copy.code!) }));
  commit({ projects: [copy, ...s.projects] });

  return copy;
}

export function deleteProject(id: string) {
  const s = load();
  commit({ projects: s.projects.filter((p) => p.id !== id) });
}

export function markDelivered(id: string, delivered: boolean) {
  const p = getProject(id);
  if (!p) return;
  replace(
    touch(
      { ...p, delivered },
      delivered ? "Projeto marcado como entregue" : "Entrega desfeita",
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Operações de peça                                                   */
/* ------------------------------------------------------------------ */

export type NewPartInput = {
  modelId: string;
  name?: string;
  parameters?: Record<string, number>;
  material?: string;
  materialId?: string | undefined;
  thickness?: number;
  quantity?: number;
  notes?: string;
  assemblyId?: string | undefined;
  subassemblyId?: string | undefined;
};


export function addPart(projectId: string, input: NewPartInput): ProjectPart | null {
  const project = getProject(projectId);
  if (!project) return null;
  const model = findPart(input.modelId);
  const part = normalizePart({
    modelId: input.modelId,
    code: makePartCode(project, input.assemblyId),
    name: input.name?.trim() || model?.name || "Peça",
    parameters: input.parameters ?? {},
    material: input.material ?? "Aço Carbono",
    materialId: input.materialId,
    thickness: input.thickness,
    quantity: input.quantity,
    assemblyId: input.assemblyId,
    subassemblyId: input.subassemblyId,
    notes: input.notes ?? "",
  });
  replace(
    touch({ ...project, parts: [...project.parts, part] }, `Peça ${part.code} "${part.name}" adicionada`),
  );
  return part;
}


function withPart(
  projectId: string,
  instanceId: string,
  fn: (part: ProjectPart) => ProjectPart,
  event?: (part: ProjectPart) => string | undefined,
) {
  const project = getProject(projectId);
  if (!project) return;
  const current = project.parts.find((p) => p.instanceId === instanceId);
  if (!current) return;
  const next = { ...fn(current), updatedAt: Date.now() };
  const parts = project.parts.map((p) => (p.instanceId === instanceId ? next : p));
  replace(touch({ ...project, parts }, event?.(next)));
}

export function updatePart(
  projectId: string,
  instanceId: string,
  patch: Partial<ProjectPart>,
  event?: string,
) {
  withPart(projectId, instanceId, (p) => ({ ...p, ...patch, instanceId: p.instanceId }), () => event);
}

/** Autosave silencioso: grava parâmetros sem inflar o histórico. */
export function savePartParameters(
  projectId: string,
  instanceId: string,
  parameters: Record<string, number>,
  extra?: Partial<Pick<ProjectPart, "material" | "materialId" | "thickness" | "quantity">>,
) {
  withPart(projectId, instanceId, (p) => ({ ...p, ...extra, parameters }));
}

export function renamePart(projectId: string, instanceId: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  withPart(
    projectId,
    instanceId,
    (p) => ({ ...p, name: clean }),
    () => `Peça renomeada para "${clean}"`,
  );
}

export function duplicatePart(projectId: string, instanceId: string) {
  const project = getProject(projectId);
  if (!project) return;
  const src = project.parts.find((p) => p.instanceId === instanceId);
  if (!src) return;
  const now = Date.now();
  const copy: ProjectPart = {
    ...structuredClone(src),
    instanceId: uid("pt"),
    code: makePartCode(project, src.assemblyId),
    name: `${src.name} 02`,
    revision: "A",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const at = project.parts.findIndex((p) => p.instanceId === instanceId) + 1;
  const parts = [...project.parts.slice(0, at), copy, ...project.parts.slice(at)];
  replace(touch({ ...project, parts }, `Peça "${src.name}" duplicada`));
}

export function removePart(projectId: string, instanceId: string) {
  const project = getProject(projectId);
  if (!project) return;
  const src = project.parts.find((p) => p.instanceId === instanceId);
  const parts = project.parts.filter((p) => p.instanceId !== instanceId);
  replace(touch({ ...project, parts }, src ? `Peça "${src.name}" removida` : undefined));
}

export function setPartStatus(projectId: string, instanceId: string, status: PartStatus) {
  withPart(
    projectId,
    instanceId,
    (p) => ({ ...p, status, progress: undefined }),
    (p) => `${p.name}: ${PART_STATUS_LABEL[status].toLowerCase()}`,
  );
}

export function getPart(projectId: string, instanceId: string): ProjectPart | null {
  return getProject(projectId)?.parts.find((p) => p.instanceId === instanceId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Semente inicial (exemplo real, editável e removível)                */
/* ------------------------------------------------------------------ */

function seedProject(): Project {
  const now = Date.now();
  const mk = (
    modelId: string,
    name: string,
    parameters: Record<string, number>,
    thickness: number,
    quantity: number,
    status: PartStatus,
  ) =>
    normalizePart({
      modelId,
      name,
      parameters,
      thickness,
      quantity,
      status,
      material: "Aço Carbono",
      createdAt: now,
      updatedAt: now,
    });

  return normalizeProject({
    name: "Chaminé Industrial",
    client: "João da Silva",
    description: "Fabricação e instalação de chaminé industrial.",
    type: "cliente",
    place: "Metalúrgica Serra Azul",
    notes: "Virolas em aço carbono, solda de topo.",
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, text: "Projeto criado" }],
    parts: [
      mk("cald.tronco-de-cone", "Cone de transição", { d1: 700, d2: 400, h: 600, thickness: 4 }, 4, 1, "calculada"),
      mk("cald.flanges", "Flange de base", { d: 820, holes: 12, thickness: 12 }, 12, 2, "rascunho"),
      mk("cald.cilindro", "Duto reto", { d: 400, h: 1500, thickness: 3 }, 3, 3, "exportada"),
    ],
  });
}
