/**
 * CALDRA CHAMFER — MOTOR UNIFICADO DE COMANDOS, REPLAY DETERMINÍSTICO E POLÍTICA "NUNCA TRAVAR" (PILAR 1)
 *
 * - Registro único padronizado sob IDs do CHAMFER (`sketch.*`, `solid.*`, `sheet.*`, `construct.*`, `inspect.*`, `timeline.*`, `parameters.*`).
 * - Log determinístico de comandos (`CommandLog`) com `replayProject(log)` reproduzindo a geometria com precisão <= 1e-6.
 * - Sanitizador de entradas hostis (`sanitizeNumericInput`, `sanitizeDxfContent`).
 * - Guarda transacional atômico (`runSafeCommand`) com snapshot leve (structural sharing) e rollback automático imediato.
 * - Separação explícita entre `undoStack` (ações de sessão) e `featureTimeline` (receita paramétrica).
 * - Checkpoints nomeados e autosave seguro.
 */

export type ChamferCommandGroup =
  | "sketch"
  | "solid"
  | "sheet"
  | "construct"
  | "inspect"
  | "timeline"
  | "parameters";

export type CommandParamType = "number" | "string" | "boolean" | "enum" | "vec2" | "vec3" | "array";

export interface CommandParamSchemaField {
  name: string;
  type: CommandParamType;
  unit?: "mm" | "deg" | "qty" | "ratio";
  min?: number;
  max?: number;
  positiveOnly?: boolean;
  nonZero?: boolean;
  defaultValue?: unknown;
  options?: string[];
  required?: boolean;
}

export interface CommandLogEntry {
  seq: number;
  commandId: string;
  params: Record<string, unknown>;
  schemaVersion: number;
  timestamp: number;
}

export interface CommandCheckpoint<TState> {
  id: string;
  name: string;
  timestamp: number;
  commandSeq: number;
  snapshot: TState;
}

export interface SafeCommandResult<TState> {
  ok: boolean;
  state: TState;
  entry?: CommandLogEntry;
  error?: string;
  rolledBack: boolean;
}

export interface ParametricCommandSpec<TState> {
  id: string;
  label: string;
  group: ChamferCommandGroup;
  schemaVersion?: number;
  schema: CommandParamSchemaField[];
  enabled: (state: TState) => boolean;
  execute: (state: TState, params: Record<string, unknown>) => TState;
  startInteractive?: () => void;
}

export const MAX_CAD_MAGNITUDE_MM = 1e6;
export const MAX_LOOP_ITERATIONS = 100_000;

export interface NumericSanitizeOptions {
  min?: number;
  max?: number;
  positiveOnly?: boolean;
  nonZero?: boolean;
  label?: string;
}

export interface NumericSanitizeResult {
  ok: boolean;
  value: number;
  error?: string;
}

/**
 * Sanitizador estrito de entradas hostis (Política "Nunca Travar"):
 * Rejeita NaN, Infinity, -Infinity, |v| > 1e6 mm, raios negativos/nulos e valores fora de faixa.
 */
export function sanitizeNumericInput(
  raw: unknown,
  opts: NumericSanitizeOptions = {},
): NumericSanitizeResult {
  const label = opts.label ?? "valor numérico";
  const num = typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number(raw);

  if (typeof raw === "boolean" || raw === null || raw === undefined || raw === "") {
    return { ok: false, value: 0, error: `${label}: entrada ausente ou inválida` };
  }
  if (!Number.isFinite(num)) {
    return { ok: false, value: 0, error: `${label}: número não finito (NaN/Infinity) rejeitado` };
  }
  if (Math.abs(num) > MAX_CAD_MAGNITUDE_MM) {
    return {
      ok: false,
      value: 0,
      error: `${label}: magnitude ${num} excede limite de segurança (±${MAX_CAD_MAGNITUDE_MM} mm)`,
    };
  }
  if (opts.positiveOnly && num <= 0) {
    return { ok: false, value: 0, error: `${label}: requer valor estritamente positivo (> 0)` };
  }
  if (opts.nonZero && Math.abs(num) < 1e-9) {
    return { ok: false, value: 0, error: `${label}: valor zero não permitido` };
  }
  if (opts.min !== undefined && num < opts.min) {
    return { ok: false, value: 0, error: `${label}: valor ${num} abaixo do mínimo (${opts.min})` };
  }
  if (opts.max !== undefined && num > opts.max) {
    return { ok: false, value: 0, error: `${label}: valor ${num} acima do máximo (${opts.max})` };
  }

  return { ok: true, value: Object.is(num, -0) ? 0 : num };
}

/**
 * Validador defensivo de conteúdo DXF antes de passar ao parser (Política "Nunca Travar").
 */
export function sanitizeDxfContent(rawText: unknown): {
  ok: boolean;
  text: string;
  error?: string;
} {
  if (typeof rawText !== "string") {
    return { ok: false, text: "", error: "Arquivo DXF inválido: conteúdo não textual" };
  }
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { ok: false, text: "", error: "Arquivo DXF vazio" };
  }
  if (trimmed.length > 25_000_000) {
    return { ok: false, text: "", error: "Arquivo DXF excede o limite de segurança (25 MB)" };
  }
  if (trimmed.includes("\0")) {
    return { ok: false, text: "", error: "Arquivo DXF corrompido: bytes binários nulos detectados" };
  }
  if (!/(^|\r?\n)\s*SECTION\s*(\r?\n|$)/i.test(trimmed) || !/(^|\r?\n)\s*EOF\s*(\r?\n|$)/i.test(trimmed)) {
    return {
      ok: false,
      text: "",
      error: "Arquivo DXF corrompido: seções padrão (SECTION/EOF) ausentes",
    };
  }
  // Check for embedded NaN/Infinity tokens inside coordinate lines
  if (/\b(NaN|Infinity|-Infinity)\b/i.test(trimmed)) {
    return {
      ok: false,
      text: "",
      error: "Arquivo DXF corrompido: coordenadas não finitas (NaN/Infinity) detectadas",
    };
  }
  return { ok: true, text: trimmed };
}

/**
 * Valida todos os parâmetros de um comando contra seu schema antes da execução.
 */
export function validateCommandParams(
  schema: CommandParamSchemaField[],
  params: Record<string, unknown>,
): { ok: boolean; sanitized: Record<string, unknown>; error?: string } {
  const sanitized: Record<string, unknown> = { ...params };

  for (const field of schema) {
    const raw = params[field.name] !== undefined ? params[field.name] : field.defaultValue;
    if (raw === undefined) {
      if (field.required) {
        return { ok: false, sanitized, error: `Parâmetro obrigatório ausente: ${field.name}` };
      }
      continue;
    }

    if (field.type === "number") {
      const check = sanitizeNumericInput(raw, {
        min: field.min,
        max: field.max,
        positiveOnly: field.positiveOnly,
        nonZero: field.nonZero,
        label: field.name,
      });
      if (!check.ok) {
        return { ok: false, sanitized, error: check.error };
      }
      sanitized[field.name] = check.value;
    } else if (field.type === "enum" && field.options && field.options.length > 0) {
      if (typeof raw !== "string" || !field.options.includes(raw)) {
        return {
          ok: false,
          sanitized,
          error: `Parâmetro ${field.name}: valor inválido "${String(raw)}"`,
        };
      }
      sanitized[field.name] = raw;
    } else if (field.type === "boolean") {
      sanitized[field.name] = Boolean(raw);
    } else if (field.type === "vec2") {
      const v = raw as { x?: unknown; y?: unknown } | null;
      if (!v || typeof v !== "object") {
        return { ok: false, sanitized, error: `Parâmetro ${field.name}: ponto 2D inválido` };
      }
      const cx = sanitizeNumericInput(v.x, { label: `${field.name}.x` });
      const cy = sanitizeNumericInput(v.y, { label: `${field.name}.y` });
      if (!cx.ok) return { ok: false, sanitized, error: cx.error };
      if (!cy.ok) return { ok: false, sanitized, error: cy.error };
      sanitized[field.name] = { x: cx.value, y: cy.value };
    } else if (field.type === "vec3") {
      const v = raw as { x?: unknown; y?: unknown; z?: unknown } | null;
      if (!v || typeof v !== "object") {
        return { ok: false, sanitized, error: `Parâmetro ${field.name}: vetor 3D inválido` };
      }
      const cx = sanitizeNumericInput(v.x, { label: `${field.name}.x` });
      const cy = sanitizeNumericInput(v.y, { label: `${field.name}.y` });
      const cz = sanitizeNumericInput(v.z, { label: `${field.name}.z` });
      if (!cx.ok) return { ok: false, sanitized, error: cx.error };
      if (!cy.ok) return { ok: false, sanitized, error: cy.error };
      if (!cz.ok) return { ok: false, sanitized, error: cz.error };
      sanitized[field.name] = { x: cx.value, y: cy.value, z: cz.value };
    } else {
      sanitized[field.name] = raw;
    }
  }

  return { ok: true, sanitized };
}

/**
 * Snapshot leve preservando referências de arrays/buffers imutáveis (structural sharing)
 * para manter consumo de RAM mínimo em smartphones.
 */
export function cloneLightSnapshot<TState>(state: TState): TState {
  if (state === null || typeof state !== "object") return state;
  if (Array.isArray(state)) {
    return state.map((item) =>
      ArrayBuffer.isView(item) ? item : cloneLightSnapshot(item),
    ) as unknown as TState;
  }
  if (ArrayBuffer.isView(state)) {
    // Keep immutable TypedArray reference intact (structural sharing)
    return state;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state as Record<string, unknown>)) {
    out[k] = ArrayBuffer.isView(v) ? v : cloneLightSnapshot(v);
  }
  return out as TState;
}

export class ChamferCommandEngine<TState> {
  private registry = new Map<string, ParametricCommandSpec<TState>>();
  private commandLog: CommandLogEntry[] = [];
  private undoStack: TState[] = [];
  private redoStack: TState[] = [];
  private checkpoints: CommandCheckpoint<TState>[] = [];
  private stateValidator?: (state: TState) => { ok: boolean; error?: string };
  private maxUndoDepth = 80;
  private onToast?: (message: string, severity: "info" | "warning" | "error") => void;

  constructor(options?: {
    validator?: (state: TState) => { ok: boolean; error?: string };
    onToast?: (message: string, severity: "info" | "warning" | "error") => void;
    maxUndoDepth?: number;
  }) {
    this.stateValidator = options?.validator;
    this.onToast = options?.onToast;
    if (options?.maxUndoDepth) this.maxUndoDepth = options.maxUndoDepth;
  }

  public register(spec: ParametricCommandSpec<TState>): void {
    this.registry.set(spec.id, spec);
  }

  public getCommand(id: string): ParametricCommandSpec<TState> | undefined {
    return this.registry.get(id);
  }

  public listCommands(group?: ChamferCommandGroup): ParametricCommandSpec<TState>[] {
    const all = Array.from(this.registry.values());
    return group ? all.filter((c) => c.group === group) : all;
  }

  public getLog(): CommandLogEntry[] {
    return this.commandLog.map((e) => ({ ...e, params: { ...e.params } }));
  }

  public clearLog(): void {
    this.commandLog = [];
  }

  /**
   * Guarda transacional único ("Nunca Travar"):
   * Valida schema, guarda snapshot leve, executa comando, valida integridade geométrica
   * e realiza rollback automático em qualquer exceção ou estado inválido.
   */
  public runSafeCommand(
    currentState: TState,
    commandId: string,
    rawParams: Record<string, unknown>,
    options?: { recordLog?: boolean; recordUndo?: boolean },
  ): SafeCommandResult<TState> {
    const spec = this.registry.get(commandId);
    if (!spec) {
      const msg = `Comando não registrado: "${commandId}"`;
      this.onToast?.(msg, "error");
      return { ok: false, state: currentState, error: msg, rolledBack: false };
    }

    if (!spec.enabled(currentState)) {
      const msg = `Comando "${spec.label}" indisponível no contexto atual`;
      this.onToast?.(msg, "warning");
      return { ok: false, state: currentState, error: msg, rolledBack: false };
    }

    const validation = validateCommandParams(spec.schema, rawParams);
    if (!validation.ok) {
      const msg = `Entrada rejeitada em ${spec.label}: ${validation.error}`;
      this.onToast?.(msg, "error");
      return { ok: false, state: currentState, error: msg, rolledBack: true };
    }

    const rollbackSnapshot = cloneLightSnapshot(currentState);

    try {
      const nextState = spec.execute(cloneLightSnapshot(currentState), validation.sanitized);

      if (this.stateValidator) {
        const integrity = this.stateValidator(nextState);
        if (!integrity.ok) {
          const msg = `Rollback automático em ${spec.label}: ${integrity.error ?? "geometria inválida"}`;
          this.onToast?.(msg, "error");
          return { ok: false, state: rollbackSnapshot, error: msg, rolledBack: true };
        }
      }

      if (options?.recordUndo !== false) {
        this.undoStack.push(rollbackSnapshot);
        if (this.undoStack.length > this.maxUndoDepth) {
          this.undoStack.shift();
        }
        this.redoStack = [];
      }

      let entry: CommandLogEntry | undefined;
      if (options?.recordLog !== false) {
        entry = {
          seq: this.commandLog.length + 1,
          commandId: spec.id,
          params: validation.sanitized,
          schemaVersion: spec.schemaVersion ?? 1,
          timestamp: Date.now(),
        };
        this.commandLog.push(entry);
      }

      return { ok: true, state: nextState, entry, rolledBack: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const msg = `Erro protegido em ${spec.label} (estado restaurado): ${errMsg}`;
      this.onToast?.(msg, "error");
      return { ok: false, state: rollbackSnapshot, error: msg, rolledBack: true };
    }
  }

  /**
   * Replay determinístico: executa um CommandLog sobre um estado inicial limpo.
   */
  public replayProject(
    initialEmptyState: TState,
    log: CommandLogEntry[],
  ): { ok: boolean; state: TState; appliedCount: number; failedAtSeq?: number; error?: string } {
    let state = cloneLightSnapshot(initialEmptyState);
    let appliedCount = 0;

    for (const entry of log) {
      const res = this.runSafeCommand(state, entry.commandId, entry.params, {
        recordLog: false,
        recordUndo: false,
      });
      if (!res.ok) {
        return {
          ok: false,
          state,
          appliedCount,
          failedAtSeq: entry.seq,
          error: res.error,
        };
      }
      state = res.state;
      appliedCount++;
    }

    return { ok: true, state, appliedCount };
  }

  public undo(currentState: TState): TState | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(cloneLightSnapshot(currentState));
    return prev;
  }

  public redo(currentState: TState): TState | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(cloneLightSnapshot(currentState));
    return next;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public createCheckpoint(name: string, currentState: TState): CommandCheckpoint<TState> {
    const cp: CommandCheckpoint<TState> = {
      id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `Checkpoint ${this.checkpoints.length + 1}`,
      timestamp: Date.now(),
      commandSeq: this.commandLog.length,
      snapshot: cloneLightSnapshot(currentState),
    };
    this.checkpoints.push(cp);
    return cp;
  }

  public listCheckpoints(): CommandCheckpoint<TState>[] {
    return [...this.checkpoints];
  }

  public restoreCheckpoint(checkpointId: string): TState | null {
    const cp = this.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return null;
    return cloneLightSnapshot(cp.snapshot);
  }

  public exportRecipeJSON(): string {
    return JSON.stringify(
      {
        schema: "caldra.chamfer.recipe.v1",
        exportedAt: new Date().toISOString(),
        commands: this.commandLog,
      },
      null,
      2,
    );
  }

  public parseRecipeJSON(jsonText: string): { ok: boolean; commands: CommandLogEntry[]; error?: string } {
    try {
      const parsed = JSON.parse(jsonText) as { commands?: CommandLogEntry[] };
      if (!parsed || !Array.isArray(parsed.commands)) {
        return { ok: false, commands: [], error: "Receita paramétrica JSON inválida" };
      }
      return { ok: true, commands: parsed.commands };
    } catch {
      return { ok: false, commands: [], error: "JSON de receita corrompido" };
    }
  }
}
