/**
 * CALDRA CAD CORE — DETERMINISTIC PARAMETRIC FEATURE TREE & DAG ENGINE
 *
 * Motor de modelagem paramétrica orientado a recursos conectado ao OCCT WASM.
 * Implementa:
 * - Pipeline determinístico de avaliação (DAG) e Dirty-Flag incremental
 * - Múltiplos Corpos (Multi-Body: NEW_BODY, ADD/UNION, CUT, INTERSECT)
 * - Resolução de Referências Topológicas Semânticas Persistentes (Topological Naming)
 * - Rollback de histórico, supressão, duplicação, reordenação validada e tolerância a falhas
 * - Assistente de Furação ISO (Hole Wizard), Roscas (Cosmética vs. Modelada 3D),
 *   Revolução, Varredura (Sweep), Loft, Casca (Shell), Nervura (Rib), Padrões (Linear/Circular) e Espelhamento (Mirror).
 */

import { getCadKernel } from "../core";
import type { ICadKernel } from "../core/CadKernel";
import type { CadShape } from "../core/CadShape";
import {
  type CadFeatureNode,
  type CadFeatureParams,
  type CadFeatureType,
  type CadTreeRebuildResult,
  type CadBodyDescriptor,
  type CadAssemblyMate,
  type CadSemanticTopologicalRef,
  type CadBooleanMode,
  type BaseBoxParams,
  type BaseCylinderParams,
  type BaseConeParams,
  type BaseSphereParams,
  type BaseTorusParams,
  type BasePolygonPrismParams,
  type BaseTubeParams,
  type HoleCutParams,
  type ThreadFeatureParams,
  type SlotCutParams,
  type FilletParams,
  type ChamferParams,
  type ShellParams,
  type RibParams,
  type DraftParams,
  type ThickenParams,
  type EdgeFlangeParams,
  type LinearPatternParams,
  type CircularPatternParams,
  type MirrorFeatureParams,
  type TransformParams,
  type ExtrudeSketchParams,
  type RevolveFeatureParams,
  type SweepFeatureParams,
  type LoftFeatureParams,
  type Sketch2DParams,
  type BoilermakingConeParams,
  type BoilermakingTransitionParams,
  type BoilermakingElbowParams,
  type BoilermakingBranchParams,
  type BoilermakingHoodParams,
  type WeldmentBeamParams,
  type WeldmentFrameParams,
  ISO_METRIC_THREADS,
} from "./CadFeatureModel";
import { CaldraBoilermakingBRep } from "../boilermaking/CaldraBoilermakingBRep";
import { CaldraWeldmentBridge } from "../weldments/CaldraWeldmentBridge";

export class CadFeatureTree {
  private features: CadFeatureNode[] = [];
  private bodies: Map<string, CadBodyDescriptor> = new Map();
  private mates: CadAssemblyMate[] = [];
  private activeBodyId: string = "body_main";
  private kernel: ICadKernel;
  private rollbackIndex: number = -1; // -1 = avalia até a última feature
  private activeFinalShape: CadShape | null = null;

  constructor(kernel?: ICadKernel) {
    this.kernel = kernel ?? getCadKernel();
    this.ensureDefaultBody();
  }

  private ensureDefaultBody(): void {
    if (!this.bodies.has("body_main")) {
      this.bodies.set("body_main", {
        id: "body_main",
        name: "Corpo Principal 1",
        isActive: true,
        isVisible: true,
        material: "Aço Carbono",
        status: "valid",
        featureIds: [],
      });
    }
  }

  // ==========================================
  // CONSULTA E GESTÃO DE RECURSOS & CORPOS
  // ==========================================

  public getFeatures(): readonly CadFeatureNode[] {
    return this.features;
  }

  public getFeature(id: string): CadFeatureNode | undefined {
    return this.features.find((f) => f.id === id);
  }

  public getBodies(): CadBodyDescriptor[] {
    return Array.from(this.bodies.values());
  }

  public getActiveBodyId(): string {
    return this.activeBodyId;
  }

  public setActiveBodyId(bodyId: string): void {
    if (this.bodies.has(bodyId)) {
      this.activeBodyId = bodyId;
      for (const [id, b] of this.bodies.entries()) {
        b.isActive = id === bodyId;
      }
    }
  }

  public getMates(): readonly CadAssemblyMate[] {
    return this.mates;
  }

  public addMate(mate: Omit<CadAssemblyMate, "id" | "status"> & Record<string, unknown>): CadAssemblyMate {
    const created: CadAssemblyMate = {
      ...mate,
      id: `mate_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      status: "SATISFIED",
    };
    this.mates.push(created);
    return created;
  }

  public removeMate(id: string): void {
    this.mates = this.mates.filter((m) => m.id !== id);
  }

  public getRollbackIndex(): number {
    return this.rollbackIndex;
  }

  public setRollbackIndex(index: number): void {
    const clamped = Math.max(-1, Math.min(index, this.features.length - 1));
    if (this.rollbackIndex !== clamped) {
      this.rollbackIndex = clamped;
    }
  }

  public addFeature(
    data: {
      id?: string;
      name: string;
      type: CadFeatureType;
      parameters: CadFeatureParams;
      bodyId?: string;
      dependencies?: string[];
      dependsOn?: string[];
      references?: string[];
      semanticReferences?: CadSemanticTopologicalRef[];
      semanticRefs?: any[];
      isSuppressed?: boolean;
    },
    insertAfterId?: string,
  ): CadFeatureNode {
    const id = data.id ?? `feat_${data.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Se operação criar novo corpo explicitamente
    const opMode =
      (data.parameters as { operation?: CadBooleanMode; booleanMode?: CadBooleanMode })?.operation ??
      (data.parameters as { booleanMode?: CadBooleanMode })?.booleanMode;
    let targetBodyId = data.bodyId || this.activeBodyId || "body_main";
    if (opMode === "new_body" && this.features.some((f) => f.type !== "reference_plane" && f.type !== "reference_axis" && f.type !== "sketch_2d")) {
      const nextIdx = this.bodies.size + 1;
      targetBodyId = `body_${nextIdx}`;
      if (!this.bodies.has(targetBodyId)) {
        this.bodies.set(targetBodyId, {
          id: targetBodyId,
          name: `Corpo Sólido ${nextIdx}`,
          isActive: true,
          isVisible: true,
          material: "Aço Carbono",
          status: "valid",
          featureIds: [],
        });
        this.setActiveBodyId(targetBodyId);
      }
    }

    // Calcula dependências explícitas no DAG
    const rawDeps = data.dependencies ?? data.dependsOn;
    const deps = rawDeps ? [...rawDeps] : [];
    const targetFeatId = (data.parameters as { targetFeatureId?: string })?.targetFeatureId;
    if (targetFeatId && !deps.includes(targetFeatId)) {
      deps.push(targetFeatId);
    } else if (deps.length === 0 && this.features.length > 0 && data.type !== "reference_plane" && data.type !== "reference_axis") {
      // Depende do último recurso ativo do mesmo corpo
      for (let i = this.features.length - 1; i >= 0; i--) {
        const prev = this.features[i]!;
        if ((prev.bodyId ?? "body_main") === targetBodyId && prev.type !== "reference_plane" && prev.type !== "reference_axis") {
          deps.push(prev.id);
          break;
        }
      }
    }

    const semRefs = data.semanticReferences ?? (data.semanticRefs as CadSemanticTopologicalRef[] | undefined);

    const newNode: CadFeatureNode = {
      id,
      name: data.name,
      type: data.type,
      order: this.features.length,
      state: "DIRTY",
      status: "DIRTY",
      isSuppressed: data.isSuppressed ?? false,
      bodyId: targetBodyId,
      parameters: { ...data.parameters },
      dependencies: deps,
      dependents: [],
      references: data.references ? [...data.references] : [],
      semanticReferences: semRefs ? [...semRefs] : [],
    };

    if (insertAfterId) {
      const idx = this.features.findIndex((f) => f.id === insertAfterId);
      if (idx >= 0) {
        this.features.splice(idx + 1, 0, newNode);
        this.reindexAndSyncGraph();
        this.markDirtyFrom(idx + 1);
        return newNode;
      }
    }

    this.features.push(newNode);
    this.reindexAndSyncGraph();
    this.markDirtyFrom(this.features.length - 1);
    return newNode;
  }

  public renameFeature(id: string, newName: string): void {
    const f = this.features.find((x) => x.id === id);
    if (f && newName.trim()) {
      f.name = newName.trim();
    }
  }

  public duplicateFeature(id: string): CadFeatureNode | null {
    const orig = this.features.find((x) => x.id === id);
    if (!orig) return null;
    const clonedParams = JSON.parse(JSON.stringify(orig.parameters)) as CadFeatureParams;
    return this.addFeature(
      {
        name: `${orig.name} (Cópia)`,
        type: orig.type,
        parameters: clonedParams,
        bodyId: orig.bodyId,
        references: [...orig.references],
        semanticReferences: orig.semanticReferences ? [...orig.semanticReferences] : undefined,
      },
      orig.id,
    );
  }

  public updateFeature(id: string, params: Partial<CadFeatureParams>): boolean {
    const idx = this.features.findIndex((f) => f.id === id);
    if (idx < 0) return false;

    const node = this.features[idx]!;
    node.parameters = { ...node.parameters, ...params };
    node.state = "DIRTY";
    node.status = "DIRTY";
    this.markDirtyFrom(idx);
    return true;
  }

  public setFeatureSuppression(id: string, isSuppressed: boolean): void {
    const idx = this.features.findIndex((f) => f.id === id);
    if (idx < 0) return;

    const node = this.features[idx]!;
    if (node.isSuppressed !== isSuppressed) {
      node.isSuppressed = isSuppressed;
      node.state = isSuppressed ? "SUPPRESSED" : "DIRTY";
      node.status = node.state;
      this.markDirtyFrom(idx);
    }
  }

  // Alias de compatibilidade com CadBRepEditor / UI
  public setSuppressed(id: string, isSuppressed: boolean): void {
    this.setFeatureSuppression(id, isSuppressed);
  }

  /**
   * Retorna lista de recursos que dependem direta ou indiretamente de `id`
   */
  public getDependentFeatures(id: string): CadFeatureNode[] {
    const node = this.features.find((f) => f.id === id);
    if (!node) return [];
    return this.features.filter(
      (f) => f.id !== id && (f.dependencies.includes(id) || (f.parameters as { targetFeatureId?: string })?.targetFeatureId === id),
    );
  }

  public getDownstreamDependents(id: string): CadFeatureNode[] {
    return this.getDependentFeatures(id);
  }

  public deleteFeature(id: string): void {
    const idx = this.features.findIndex((f) => f.id === id);
    if (idx < 0) return;

    const removed = this.features.splice(idx, 1)[0]!;
    if (removed.cachedShape) {
      try {
        this.kernel.release(removed.cachedShape);
      } catch {
        // Ignora
      }
    }

    this.reindexAndSyncGraph();
    this.markDirtyFrom(idx);
  }

  public removeFeature(id: string): void {
    this.deleteFeature(id);
  }

  public moveFeature(id: string, direction: "up" | "down"): { success: boolean; reason?: string } {
    const idx = this.features.findIndex((f) => f.id === id);
    if (idx < 0) return { success: false, reason: "Recurso não encontrado." };
    const targetIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(this.features.length - 1, idx + 1);
    return this.reorderFeature(id, targetIdx);
  }

  public reorderFeature(id: string, targetIndex: number): { success: boolean; reason?: string } {
    const currentIndex = this.features.findIndex((f) => f.id === id);
    if (currentIndex < 0) return { success: false, reason: "Recurso não encontrado." };

    const clampedTarget = Math.max(0, Math.min(targetIndex, this.features.length - 1));
    if (currentIndex === clampedTarget) return { success: true };

    const item = this.features[currentIndex]!;

    // Validação de dependências DAG: um recurso não pode ser movido para antes de suas dependências
    for (const depId of item.dependencies) {
      const depIdx = this.features.findIndex((f) => f.id === depId);
      if (depIdx >= 0 && clampedTarget <= depIdx && depIdx !== currentIndex) {
        const depName = this.features[depIdx]?.name || depId;
        return {
          success: false,
          reason: `Não é possível mover "${item.name}" para antes de sua dependência "${depName}".`,
        };
      }
    }

    this.features.splice(currentIndex, 1);
    this.features.splice(clampedTarget, 0, item);
    this.reindexAndSyncGraph();
    this.markDirtyFrom(Math.min(currentIndex, clampedTarget));
    return { success: true };
  }

  private reindexAndSyncGraph(): void {
    for (const f of this.features) {
      f.dependents = [];
    }
    for (let i = 0; i < this.features.length; i++) {
      const node = this.features[i]!;
      node.order = i;
      for (const depId of node.dependencies) {
        const parent = this.features.find((p) => p.id === depId);
        if (parent && parent.dependents && !parent.dependents.includes(node.id)) {
          parent.dependents.push(node.id);
        }
      }
    }
  }

  private markDirtyFrom(startIndex: number): void {
    for (let i = startIndex; i < this.features.length; i++) {
      const f = this.features[i]!;
      if (!f.isSuppressed) {
        f.state = i === startIndex ? "DIRTY" : "STALE";
        f.status = f.state;
      }
    }
  }

  // ==========================================
  // RESOLUÇÃO DE REFERÊNCIAS TOPOLÓGICAS SEMÂNTICAS
  // ==========================================

  private async validateAndResolveSemanticRefs(
    feature: CadFeatureNode,
    currentShape: CadShape | null,
  ): Promise<void> {
    if (!feature.semanticReferences || feature.semanticReferences.length === 0 || !currentShape) {
      return;
    }

    for (const ref of feature.semanticReferences) {
      if (ref.sourceFeatureId) {
        const sourceFeat = this.features.find((f) => f.id === ref.sourceFeatureId);
        if (!sourceFeat || sourceFeat.isSuppressed) {
          throw new Error(
            `Referência topológica perdida: o recurso de origem "${sourceFeat?.name || ref.sourceFeatureId}" foi suprimido ou removido.`,
          );
        }
      }

      if (ref.kind === "face") {
        const faces = await this.kernel.getFaces(currentShape).catch(() => []);
        if (faces.length === 0) continue;

        // Procura face compatível por fingerprint ou orientação semântica + centroide
        const matched = faces.find((face) => {
          if (ref.fingerprint && face.fingerprint === ref.fingerprint) return true;
          if (ref.normal && face.normal) {
            const dot =
              ref.normal.x * face.normal.x +
              ref.normal.y * face.normal.y +
              ref.normal.z * face.normal.z;
            return dot > 0.85;
          }
          return false;
        });

        if (!matched) {
          throw new Error(
            `Referência de face perdida (${ref.semanticRole}) — a face referenciada foi eliminada por uma operação anterior. Selecione uma nova face.`,
          );
        }
      }
    }
  }

  // ==========================================
  // RECONSTRUÇÃO DETERMINÍSTICA DO MODELO (INCREMENTAL DAG REBUILD)
  // ==========================================

  public async rebuild(): Promise<CadTreeRebuildResult> {
    const startTime = performance.now();
    let rebuiltCount = 0;
    let cachedCount = 0;
    const errorMessages: string[] = [];

    if (!this.kernel.isInitialized) {
      await this.kernel.init();
    }

    this.ensureDefaultBody();

    const effectiveLimit =
      this.rollbackIndex >= 0 ? Math.min(this.rollbackIndex + 1, this.features.length) : this.features.length;

    let currentShape: CadShape | null = null;
    let upstreamChanged = false;

    try {
      for (let i = 0; i < effectiveLimit; i++) {
        const feature = this.features[i]!;

        if (feature.isSuppressed) {
          feature.state = "SUPPRESSED";
          feature.status = "SUPPRESSED";
          continue;
        }

        // Nós construtivos sem volume (Planos, Eixos, Esboços 2D)
        if (
          feature.type === "reference_plane" ||
          feature.type === "reference_axis" ||
          feature.type === "sketch_2d"
        ) {
          if (feature.type === "sketch_2d") {
            const sp = feature.parameters as Sketch2DParams;
            if ((sp.width !== undefined && sp.width <= 0) || (sp.height !== undefined && sp.height <= 0)) {
              feature.state = "ERROR";
              feature.status = "ERROR";
              feature.errorMessage = "Perfil de esboço inválido: dimensões devem ser maiores que zero.";
              errorMessages.push(`${feature.name}: ${feature.errorMessage}`);
              continue;
            }
          }
          feature.state = "VALID";
          feature.status = "VALID";
          feature.errorMessage = undefined;
          cachedCount++;
          continue;
        }

        // Reutilização incremental de cache DAG (Zero-Idle / Dirty-Flag)
        if (!upstreamChanged && feature.state === "VALID" && feature.cachedShape) {
          feature.status = "VALID";
          currentShape = feature.cachedShape;
          cachedCount++;
          continue;
        }

        const featStart = performance.now();
        try {
          // Valida referências topológicas persistentes antes de executar
          await this.validateAndResolveSemanticRefs(feature, currentShape);

          const nextShape = await this.evaluateFeature(feature, currentShape);
          if (nextShape) {
            currentShape = nextShape;
            feature.cachedShape = nextShape;
            feature.state = "VALID";
            feature.status = "VALID";
            feature.errorMessage = undefined;
            feature.executionTimeMs = performance.now() - featStart;
            rebuiltCount++;
            upstreamChanged = true;
          }
        } catch (featErr: unknown) {
          feature.state = "ERROR";
          feature.status = "ERROR";
          feature.errorMessage = featErr instanceof Error ? featErr.message : String(featErr);
          errorMessages.push(`${feature.name}: ${feature.errorMessage}`);
          console.warn(`[CadFeatureTree] Recurso '${feature.name}' falhou:`, feature.errorMessage);
          // Tolerância a falhas: preserva currentShape válido anterior e marca dependentes diretos como STALE
          const dependents = this.getDependentFeatures(feature.id);
          for (const dep of dependents) {
            if (!dep.isSuppressed) {
              dep.state = "STALE";
              dep.status = "STALE";
              dep.warningMessage = `Desatualizado devido a falha em "${feature.name}".`;
            }
          }
        }
      }

      this.activeFinalShape = currentShape;

      if (!currentShape) {
        const firstError = this.features.find((f) => f.state === "ERROR");
        const errMsg = firstError?.errorMessage || "Nenhum sólido B-Rep válido foi gerado a partir dos recursos.";
        const durationMs = performance.now() - startTime;
        return {
          success: false,
          activeShape: null,
          tessellation: null,
          massProperties: null,
          features: [...this.features],
          bodies: this.getBodies(),
          mates: [...this.mates],
          rebuiltCount,
          recomputedCount: rebuiltCount,
          cachedCount,
          durationMs,
          totalExecutionTimeMs: durationMs,
          error: errMsg,
          errors: errorMessages.length > 0 ? errorMessages : [errMsg],
        };
      }

      // Extrai tesselação de alta resolução radial (128+ segmentos) e propriedades físicas do sólido B-Rep resultante
      const [tess, mass] = await Promise.all([
        this.kernel.tessellate(currentShape, { linearDeflection: 0.008, angularDeflection: 0.028 }),
        this.kernel.getMassProperties(currentShape, 7.85),
      ]);

      // Atualiza descritor do corpo ativo
      const activeBody = this.bodies.get(this.activeBodyId) || this.bodies.get("body_main");
      if (activeBody) {
        activeBody.shape = currentShape;
        activeBody.massProperties = mass;
        activeBody.status = errorMessages.length > 0 ? "warning" : "valid";
        activeBody.featureIds = this.features
          .filter((f) => (f.bodyId ?? "body_main") === activeBody.id)
          .map((f) => f.id);
      }

      const durationMs = performance.now() - startTime;

      return {
        success: true,
        activeShape: currentShape,
        tessellation: tess,
        massProperties: mass,
        features: [...this.features],
        bodies: this.getBodies(),
        mates: [...this.mates],
        rebuiltCount,
        recomputedCount: rebuiltCount,
        cachedCount,
        durationMs,
        totalExecutionTimeMs: durationMs,
        errors: errorMessages,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[CadFeatureTree] Erro durante o Rebuild:", err);
      const durationMs = performance.now() - startTime;

      return {
        success: false,
        activeShape: currentShape,
        tessellation: null,
        massProperties: null,
        features: [...this.features],
        bodies: this.getBodies(),
        mates: [...this.mates],
        rebuiltCount,
        recomputedCount: rebuiltCount,
        cachedCount,
        durationMs,
        totalExecutionTimeMs: durationMs,
        error: errMsg,
        errors: [errMsg],
      };
    }
  }

  // ==========================================
  // APLICADOR UNIFICADO DE OPERAÇÕES BOOLEANAS
  // ==========================================

  private async applyBooleanMode(
    inputSolid: CadShape | null,
    toolSolid: CadShape,
    mode: CadBooleanMode | undefined,
    name: string,
  ): Promise<CadShape> {
    if (!inputSolid || mode === "new_body") {
      if (inputSolid && mode === "new_body") {
        // Mantém os múltiplos corpos visíveis no mesmo composto para o viewport
        return await this.kernel.fuse(inputSolid, toolSolid, name);
      }
      return toolSolid;
    }

    switch (mode) {
      case "cut":
        return await this.kernel.cut(inputSolid, toolSolid, name);
      case "intersect":
        return await this.kernel.intersect(inputSolid, toolSolid, name);
      case "union":
      default:
        return await this.kernel.fuse(inputSolid, toolSolid, name);
    }
  }

  // ==========================================
  // DISPATCHER DE EXECUÇÃO DE OPERAÇÕES CAD 3D
  // ==========================================

  private async evaluateFeature(
    node: CadFeatureNode,
    inputSolid: CadShape | null,
  ): Promise<CadShape> {
    switch (node.type) {
      // ----------------------------------------------------
      // 1. PRIMITIVAS PARAMÉTRICAS COMBINÁVEIS
      // ----------------------------------------------------
      case "base_box": {
        const p = node.parameters as BaseBoxParams;
        if (p.width <= 0 || p.length <= 0 || p.height <= 0) {
          throw new Error("Dimensões da Caixa devem ser maiores que 0 mm.");
        }
        let box = await this.kernel.createBox(p.width, p.length, p.height, p.centered ?? true, node.name);
        if (p.offsetX || p.offsetY || p.offsetZ) {
          const moved = await this.kernel.translate(box, p.offsetX ?? 0, p.offsetY ?? 0, p.offsetZ ?? 0);
          this.kernel.release(box);
          box = moved;
        }
        node.cachedToolShape = box;
        return await this.applyBooleanMode(inputSolid, box, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_cylinder": {
        const p = node.parameters as BaseCylinderParams;
        if (p.radius <= 0 || p.height <= 0) {
          throw new Error("Raio e Altura do Cilindro devem ser maiores que 0 mm.");
        }
        let cyl = await this.kernel.createCylinder(p.radius, p.height, p.centered ?? true, node.name);
        if (p.offsetX || p.offsetY || p.offsetZ) {
          const moved = await this.kernel.translate(cyl, p.offsetX ?? 0, p.offsetY ?? 0, p.offsetZ ?? 0);
          this.kernel.release(cyl);
          cyl = moved;
        }
        node.cachedToolShape = cyl;
        return await this.applyBooleanMode(inputSolid, cyl, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_cone": {
        const p = node.parameters as BaseConeParams;
        if (p.radiusBottom < 0 || p.radiusTop < 0 || p.height <= 0) {
          throw new Error("Parâmetros inválidos para o Cone/Tronco.");
        }
        let cone = await this.kernel.createCone(
          Math.max(0.5, p.radiusBottom),
          Math.max(0, p.radiusTop),
          p.height,
          node.name,
        );
        if (p.offsetX || p.offsetY || p.offsetZ) {
          const moved = await this.kernel.translate(cone, p.offsetX ?? 0, p.offsetY ?? 0, p.offsetZ ?? 0);
          this.kernel.release(cone);
          cone = moved;
        }
        node.cachedToolShape = cone;
        return await this.applyBooleanMode(inputSolid, cone, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_sphere": {
        const p = node.parameters as BaseSphereParams;
        if (p.radius <= 0) throw new Error("Raio da Esfera deve ser maior que 0 mm.");
        let sph = await this.kernel.createSphere(p.radius, node.name);
        if (p.offsetX || p.offsetY || p.offsetZ) {
          const moved = await this.kernel.translate(sph, p.offsetX ?? 0, p.offsetY ?? 0, p.offsetZ ?? 0);
          this.kernel.release(sph);
          sph = moved;
        }
        node.cachedToolShape = sph;
        return await this.applyBooleanMode(inputSolid, sph, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_torus": {
        const p = node.parameters as BaseTorusParams;
        if (p.majorRadius <= p.minorRadius || p.minorRadius <= 0) {
          throw new Error("Raio Maior do Toro deve exceder o Raio do Tubo.");
        }
        let tor = await this.kernel.createTorus(p.majorRadius, p.minorRadius, node.name);
        if (p.offsetZ) {
          const moved = await this.kernel.translate(tor, 0, 0, p.offsetZ);
          this.kernel.release(tor);
          tor = moved;
        }
        node.cachedToolShape = tor;
        return await this.applyBooleanMode(inputSolid, tor, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_polygon_prism": {
        const p = node.parameters as BasePolygonPrismParams & { radius?: number };
        const sides = Math.max(3, Math.min(32, Math.round(p.sides || 6)));
        const radius = Math.max(1, p.acrossFlatsOrRadius || p.radius || 30);
        const height = Math.max(1, p.height || 25);
        const polyFace = await this.kernel.createRegularPolygonFace(
          sides,
          radius,
          `${node.name}_face`,
          { x: p.offsetX ?? 0, y: p.offsetY ?? 0, z: p.offsetZ ?? 0 },
          { x: 0, y: 0, z: 1 },
        );
        const prism = await this.kernel.extrude(polyFace, 0, 0, height, node.name);
        this.kernel.release(polyFace);
        node.cachedToolShape = prism;
        return await this.applyBooleanMode(inputSolid, prism, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      case "base_tube": {
        const p = node.parameters as BaseTubeParams;
        const rOut = Math.max(2, (p.outerDiameter || 100) / 2);
        const wall = Math.max(0.5, Math.min(rOut - 0.5, p.wallThickness || 5));
        const rIn = rOut - wall;
        const h = Math.max(1, p.height || 120);
        const outerCyl = await this.kernel.createCylinder(rOut, h, true, "OuterTube");
        const innerCyl = await this.kernel.createCylinder(rIn, h + 4, true, "InnerTube");
        const shiftedInner = await this.kernel.translate(innerCyl, 0, 0, -2);
        let tube = await this.kernel.cut(outerCyl, shiftedInner, node.name);
        this.kernel.release(outerCyl);
        this.kernel.release(innerCyl);
        this.kernel.release(shiftedInner);
        if (p.offsetZ) {
          const moved = await this.kernel.translate(tube, 0, 0, p.offsetZ);
          this.kernel.release(tube);
          tube = moved;
        }
        node.cachedToolShape = tube;
        return await this.applyBooleanMode(inputSolid, tube, p.operation ?? (inputSolid ? "union" : "new_body"), node.name);
      }

      // ----------------------------------------------------
      // 2. EXTRUSÃO E CORTE POR EXTRUSÃO (CRI / MOD)
      // ----------------------------------------------------
      case "extrude_sketch":
      case "cut_extrude": {
        const p = node.parameters as ExtrudeSketchParams & {
          profileKind?: string;
          diameter?: number;
          centerX?: number;
          centerY?: number;
          booleanMode?: CadBooleanMode;
        };
        const isCut = node.type === "cut_extrude" || p.operation === "cut" || p.booleanMode === "cut";
        if (isCut && !inputSolid && p.endCondition === "through_all") {
          throw new Error("Corte passante requer um corpo-alvo sólido válido.");
        }

        const rawDepth = Math.max(0.2, p.depth || 25);
        const depth = p.endCondition === "through_all" ? Math.max(rawDepth, 500) : rawDepth;
        const sign = p.direction === "inverted" ? -1 : 1;
        const ox = p.offsetX ?? p.centerX ?? 0;
        const oy = p.offsetY ?? p.centerY ?? 0;
        const oz = p.offsetZ ?? (p.endCondition === "midplane" || p.symmetric || (p.direction as string) === "both" ? -depth / 2 : 0);
        const dz = depth * sign;
        const zBase = dz >= 0 ? oz : oz + dz;
        const absDepth = Math.abs(dz);

        // Extrusão de esboço 2D real (com suporte a furos internos, círculos analíticos e múltiplos contornos)
        const contoursToExtrude =
          p.sketchProfile?.multiContours && p.sketchProfile.multiContours.length > 0
            ? p.sketchProfile.multiContours
            : p.sketchProfile?.points && p.sketchProfile.points.length >= 3
              ? [
                  {
                    points: p.sketchProfile.points,
                    circle: p.sketchProfile.circle,
                    holes: p.sketchProfile.holes,
                  },
                ]
              : null;

        if (contoursToExtrude && contoursToExtrude.length > 0) {
          let combinedSolid: CadShape | null = null;

          for (let cIdx = 0; cIdx < contoursToExtrude.length; cIdx++) {
            const contour = contoursToExtrude[cIdx]!;
            let contourSolid: CadShape;

            if (contour.circle && contour.circle.r > 0.05 && !p.draftAngleDeg) {
              // Cilindro analítico exato para perfis circulares
              const cyl = await this.kernel.createCylinder(
                contour.circle.r,
                absDepth,
                true,
                `${node.name}_cyl_${cIdx}`,
              );
              const tx = ox + contour.circle.cx;
              const ty = oy + contour.circle.cy;
              if (Math.abs(tx) > 1e-5 || Math.abs(ty) > 1e-5 || Math.abs(zBase) > 1e-5) {
                contourSolid = await this.kernel.translate(cyl, tx, ty, zBase);
                this.kernel.release(cyl);
              } else {
                contourSolid = cyl;
              }
            } else if (contour.circle && contour.circle.r > 0.05 && p.draftAngleDeg) {
              const circFace = await this.kernel.createCircleFace(
                contour.circle.r,
                `${node.name}_circ_${cIdx}`,
              );
              const movedFace = await this.kernel.translate(
                circFace,
                ox + contour.circle.cx,
                oy + contour.circle.cy,
                oz,
              );
              this.kernel.release(circFace);
              contourSolid = await this.kernel.draftExtrude(
                movedFace,
                0,
                0,
                dz,
                p.draftAngleDeg,
                `${node.name}_${cIdx}`,
              );
              this.kernel.release(movedFace);
            } else {
              const polyFace = await this.kernel.createPolygonFace(
                contour.points,
                `${node.name}_poly_${cIdx}`,
                { x: ox, y: oy, z: oz },
                { x: 0, y: 0, z: 1 },
              );
              contourSolid = p.draftAngleDeg
                ? await this.kernel.draftExtrude(polyFace, 0, 0, dz, p.draftAngleDeg, `${node.name}_${cIdx}`)
                : await this.kernel.extrude(polyFace, 0, 0, dz, `${node.name}_${cIdx}`);
              this.kernel.release(polyFace);
            }

            // Subtrai furos internos do contorno (ex: furos circulares ou recortes poligonais)
            if (contour.holes && contour.holes.length > 0) {
              const holeZStart = zBase - 2;
              const holeHeight = absDepth + 4;

              for (let hIdx = 0; hIdx < contour.holes.length; hIdx++) {
                const hole = contour.holes[hIdx]!;
                try {
                  let holeTool: CadShape;
                  if (hole.circle && hole.circle.r > 0.05) {
                    const hCyl = await this.kernel.createCylinder(
                      hole.circle.r,
                      holeHeight,
                      true,
                      `${node.name}_hole_cyl_${hIdx}`,
                    );
                    holeTool = await this.kernel.translate(
                      hCyl,
                      ox + hole.circle.cx,
                      oy + hole.circle.cy,
                      holeZStart,
                    );
                    this.kernel.release(hCyl);
                  } else if (hole.points && hole.points.length >= 3) {
                    const hFace = await this.kernel.createPolygonFace(
                      hole.points,
                      `${node.name}_hole_face_${hIdx}`,
                      { x: ox, y: oy, z: holeZStart },
                      { x: 0, y: 0, z: 1 },
                    );
                    holeTool = await this.kernel.extrude(
                      hFace,
                      0,
                      0,
                      holeHeight,
                      `${node.name}_hole_ext_${hIdx}`,
                    );
                    this.kernel.release(hFace);
                  } else {
                    continue;
                  }

                  const nextCut = await this.kernel.cut(
                    contourSolid,
                    holeTool,
                    `${node.name}_cut_${hIdx}`,
                  );
                  this.kernel.release(contourSolid);
                  this.kernel.release(holeTool);
                  contourSolid = nextCut;
                } catch (holeErr) {
                  console.warn(`[CadFeatureTree] Aviso ao subtrair furo #${hIdx} do esboço:`, holeErr);
                }
              }
            }

            if (!combinedSolid) {
              combinedSolid = contourSolid;
            } else {
              const fused = await this.kernel.fuse(combinedSolid, contourSolid, node.name);
              this.kernel.release(combinedSolid);
              this.kernel.release(contourSolid);
              combinedSolid = fused;
            }
          }

          if (combinedSolid) {
            node.cachedToolShape = combinedSolid;
            const effectiveOp: CadBooleanMode = isCut
              ? "cut"
              : (p.operation || p.booleanMode || (inputSolid ? "union" : "new_body"));
            return await this.applyBooleanMode(inputSolid, combinedSolid, effectiveOp, node.name);
          }
        }

        let profileFace: CadShape;
        const profileType = p.profileType || p.profileKind || "rectangle";

        if (profileType === "circle") {
          const r = Math.max(1, p.radius || (p.diameter ? p.diameter / 2 : p.width ? p.width / 2 : 40));
          const circle = await this.kernel.createCircleFace(r, `${node.name}_circ`);
          profileFace = ox || oy || oz ? await this.kernel.translate(circle, ox, oy, oz) : circle;
        } else if (profileType === "polygon") {
          const sides = Math.max(3, p.sides || 6);
          const r = Math.max(1, p.radius || (p.diameter ? p.diameter / 2 : p.width ? p.width / 2 : 35));
          profileFace = await this.kernel.createRegularPolygonFace(
            sides,
            r,
            `${node.name}_regpoly`,
            { x: ox, y: oy, z: oz },
            { x: 0, y: 0, z: 1 },
          );
        } else if (profileType === "slot") {
          const centerDist = Math.max(2, p.length || 50);
          const r = Math.max(1, p.radius || (p.width ? p.width / 2 : 10));
          profileFace = await this.kernel.createSlotFace(
            centerDist,
            r,
            `${node.name}_slot`,
            { x: ox, y: oy, z: oz },
            { x: 0, y: 0, z: 1 },
          );
        } else if (profileType === "l_profile") {
          const w = Math.max(10, p.width || 100);
          const h = Math.max(10, p.length || 100);
          const t = Math.max(2, Math.min(w * 0.45, h * 0.45, p.thinWallThickness || 15));
          const lPts = [
            { x: -w / 2, y: -h / 2 },
            { x: w / 2, y: -h / 2 },
            { x: w / 2, y: -h / 2 + t },
            { x: -w / 2 + t, y: -h / 2 + t },
            { x: -w / 2 + t, y: h / 2 },
            { x: -w / 2, y: h / 2 },
          ];
          profileFace = await this.kernel.createPolygonFace(
            lPts,
            `${node.name}_lprof`,
            { x: ox, y: oy, z: oz },
            { x: 0, y: 0, z: 1 },
          );
        } else {
          const w = Math.max(1, p.width ?? 120);
          const l = Math.max(1, p.length ?? 100);
          const rectPts = [
            { x: -w / 2, y: -l / 2 },
            { x: w / 2, y: -l / 2 },
            { x: w / 2, y: l / 2 },
            { x: -w / 2, y: l / 2 },
          ];
          profileFace = await this.kernel.createPolygonFace(
            rectPts,
            `${node.name}_rect`,
            { x: ox, y: oy, z: oz },
            { x: 0, y: 0, z: 1 },
          );
        }

        const extruded = p.draftAngleDeg
          ? await this.kernel.draftExtrude(profileFace, 0, 0, dz, p.draftAngleDeg, node.name)
          : await this.kernel.extrude(profileFace, 0, 0, dz, node.name);

        node.cachedToolShape = extruded;
        const effectiveOp: CadBooleanMode = isCut
          ? "cut"
          : (p.operation || p.booleanMode || (inputSolid ? "union" : "new_body"));
        return await this.applyBooleanMode(inputSolid, extruded, effectiveOp, node.name);
      }

      // ----------------------------------------------------
      // 3. REVOLUÇÃO E CORTE POR REVOLUÇÃO
      // ----------------------------------------------------
      case "revolve_feature":
      case "cut_revolve": {
        const p = node.parameters as RevolveFeatureParams & {
          profileWidth?: number;
          profileHeight?: number;
          profilePreset?: string;
          booleanMode?: CadBooleanMode;
        };
        const isCut = node.type === "cut_revolve" || p.operation === "cut" || p.booleanMode === "cut";
        const rInner = Math.max(0, p.innerRadius ?? 20);
        const w = Math.max(1, p.width ?? p.profileWidth ?? 30);
        const h = Math.max(1, p.height ?? p.profileHeight ?? 80);
        const angleRad = (Math.max(5, Math.min(360, p.angleDeg || 360)) * Math.PI) / 180;
        const oz = p.offsetZ ?? 0;
        const profType = p.profileType || p.profilePreset || "rectangle";

        let pts: Array<{ x: number; y: number }>;
        if (profType === "stepped_shaft") {
          pts = [
            { x: rInner, y: 0 },
            { x: rInner + w, y: 0 },
            { x: rInner + w, y: h * 0.4 },
            { x: rInner + w * 0.7, y: h * 0.4 },
            { x: rInner + w * 0.7, y: h * 0.8 },
            { x: rInner + w * 0.5, y: h * 0.8 },
            { x: rInner + w * 0.5, y: h },
            { x: rInner, y: h },
          ];
        } else if (profType === "flange_section") {
          pts = [
            { x: Math.max(5, rInner), y: 0 },
            { x: rInner + w, y: 0 },
            { x: rInner + w, y: h * 0.35 },
            { x: rInner + w * 0.45, y: h * 0.35 },
            { x: rInner + w * 0.45, y: h },
            { x: Math.max(5, rInner), y: h },
          ];
        } else {
          pts = [
            { x: rInner, y: 0 },
            { x: rInner + w, y: 0 },
            { x: rInner + w, y: h },
            { x: rInner, y: h },
          ];
        }

        // Perfil no plano XZ (normal Y) para revolucionar em torno do eixo Z
        const face = await this.kernel.createPolygonFace(
          pts,
          `${node.name}_rev_face`,
          { x: 0, y: 0, z: oz },
          { x: 0, y: 1, z: 0 },
        );
        const revolved = await this.kernel.revolve(
          face,
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 },
          angleRad,
          node.name,
        );
        this.kernel.release(face);
        node.cachedToolShape = revolved;

        const effectiveOp: CadBooleanMode = isCut
          ? "cut"
          : (p.operation || p.booleanMode || (inputSolid ? "union" : "new_body"));
        return await this.applyBooleanMode(inputSolid, revolved, effectiveOp, node.name);
      }

      // ----------------------------------------------------
      // 4. VARREDURA (SWEEP) E CORTE POR VARREDURA
      // ----------------------------------------------------
      case "sweep_feature":
      case "cut_sweep": {
        const p = node.parameters as SweepFeatureParams & {
          profileRadius?: number;
          pathRadius?: number;
          pathLength?: number;
          helixPitch?: number;
          booleanMode?: CadBooleanMode;
        };
        const isCut = node.type === "cut_sweep" || p.operation === "cut" || p.booleanMode === "cut";
        const profR = Math.max(1, p.profileRadiusOrWidth || p.profileRadius || 12);
        const pathR = Math.max(profR * 2, p.pathLengthOrRadius || p.pathRadius || 60);
        const pathH = Math.max(10, p.pathHeightOrPitch || p.pathLength || 100);

        let swept: CadShape;
        if (p.pathType === "helix") {
          const helixWire = await this.kernel.createHelixWire(
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            Math.max(profR * 2.2, p.pathHeightOrPitch || p.helixPitch || 25),
            pathH,
            pathR,
            false,
            `${node.name}_helix`,
          );
          const profFace = await this.kernel.createRegularPolygonFace(
            p.profileShape === "polygon" ? 6 : 128,
            profR,
            `${node.name}_prof`,
            { x: pathR, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          );
          swept = await this.kernel.sweep(profFace, helixWire, node.name);
        } else {
          // Caminho tubular / arco em L via Loft entre seções orientadas
          const f1 = await this.kernel.createRegularPolygonFace(
            p.profileShape === "rectangle" ? 4 : 128,
            profR,
            "s1",
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
          );
          const f2 = await this.kernel.createRegularPolygonFace(
            p.profileShape === "rectangle" ? 4 : 128,
            profR,
            "s2",
            { x: pathR * 0.35, y: 0, z: pathH * 0.5 },
            { x: 0, y: 0, z: 1 },
          );
          const f3 = await this.kernel.createRegularPolygonFace(
            p.profileShape === "rectangle" ? 4 : 128,
            profR,
            "s3",
            { x: pathR, y: 0, z: pathH },
            { x: 0, y: 0, z: 1 },
          );
          swept = await this.kernel.loft([f1, f2, f3], true, false, node.name);
        }

        node.cachedToolShape = swept;
        const effectiveOp: CadBooleanMode = isCut
          ? "cut"
          : (p.operation || p.booleanMode || (inputSolid ? "union" : "new_body"));
        return await this.applyBooleanMode(inputSolid, swept, effectiveOp, node.name);
      }

      // ----------------------------------------------------
      // 5. TRANSIÇÃO / LOFT MULTISSEÇÃO
      // ----------------------------------------------------
      case "loft_feature": {
        const p = node.parameters as LoftFeatureParams & {
          bottomShape?: "rectangle" | "circle" | "polygon";
          bottomWidth?: number;
          topShape?: "circle" | "rectangle" | "polygon";
          topDiameter?: number;
          booleanMode?: CadBooleanMode;
        };
        const bW = Math.max(5, p.bottomWidthOrDia || p.bottomWidth || 160);
        const bL = Math.max(5, p.bottomLength || bW);
        const tW = Math.max(5, p.topWidthOrDia || p.topDiameter || 90);
        const tL = Math.max(5, p.topLength || tW);
        const h = Math.max(5, p.height || 120);
        const bProf = p.bottomProfile || p.bottomShape || "rectangle";
        const tProf = p.topProfile || p.topShape || "circle";

        const bottomFace =
          bProf === "circle"
            ? await this.kernel.createRegularPolygonFace(128, bW / 2, "loft_b", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
            : bProf === "polygon"
              ? await this.kernel.createRegularPolygonFace(6, bW / 2, "loft_b", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
              : await this.kernel.createPolygonFace(
                  [
                    { x: -bW / 2, y: -bL / 2 },
                    { x: bW / 2, y: -bL / 2 },
                    { x: bW / 2, y: bL / 2 },
                    { x: -bW / 2, y: bL / 2 },
                  ],
                  "loft_b",
                  { x: 0, y: 0, z: 0 },
                  { x: 0, y: 0, z: 1 },
                );

        const topFace =
          tProf === "rectangle"
            ? await this.kernel.createPolygonFace(
                [
                  { x: -tW / 2, y: -tL / 2 },
                  { x: tW / 2, y: -tL / 2 },
                  { x: tW / 2, y: tL / 2 },
                  { x: -tW / 2, y: tL / 2 },
                ],
                "loft_t",
                { x: 0, y: 0, z: h },
                { x: 0, y: 0, z: 1 },
              )
            : tProf === "polygon"
              ? await this.kernel.createRegularPolygonFace(6, tW / 2, "loft_t", { x: 0, y: 0, z: h }, { x: 0, y: 0, z: 1 })
              : await this.kernel.createRegularPolygonFace(128, tW / 2, "loft_t", { x: 0, y: 0, z: h }, { x: 0, y: 0, z: 1 });

        const lofted = await this.kernel.loft([bottomFace, topFace], true, p.ruled ?? true, node.name);
        node.cachedToolShape = lofted;
        return await this.applyBooleanMode(
          inputSolid,
          lofted,
          p.operation || p.booleanMode || (inputSolid ? "union" : "new_body"),
          node.name,
        );
      }

      // ----------------------------------------------------
      // 6. ASSISTENTE DE FURAÇÃO (HOLE WIZARD ISO & HOLE CUT)
      // ----------------------------------------------------
      case "hole_cut":
      case "hole_wizard": {
        const solid = inputSolid ?? (await this.kernel.createBox(120, 120, 40, true, "Bloco Base"));
        const p = node.parameters as HoleCutParams & { endCondition?: string };
        const isoSpec = p.isoSize ? ISO_METRIC_THREADS[p.isoSize as keyof typeof ISO_METRIC_THREADS] : undefined;

        const holeType = p.holeType || "simple";
        const effectiveDia =
          holeType === "tapped_iso" && isoSpec
            ? isoSpec.tapDrillDiameterMm
            : Math.max(0.5, p.diameter || (isoSpec ? isoSpec.clearanceHoleMm : 16));
        const radius = effectiveDia / 2;
        const isThrough = p.isThrough ?? (p.endCondition === "through_all");
        const depth = isThrough ? Math.max(p.depth || 120, 300) : Math.max(1, p.depth || 30);

        if (holeType === "tapped_iso" && isoSpec) {
          node.cosmeticMetadata = {
            threadDesignation: `${isoSpec.designation}×${isoSpec.pitchMm}`,
            threadPitchMm: isoSpec.pitchMm,
            threadLengthMm: depth,
            isInternalThread: true,
          };
        }

        const positions =
          p.positions && p.positions.length > 0
            ? p.positions
            : [p.position ?? { x: 0, y: 0, z: 0 }];

        let resultSolid = solid;
        let lastHoleTool: CadShape | null = null;

        for (const pos of positions) {
          const px = pos.x ?? 0;
          const py = pos.y ?? 0;
          const pz = pos.z ?? (isThrough ? -depth / 2 : 0);

          // Corpo principal do furo
          const mainCyl = await this.kernel.createCylinder(radius, depth + 10, true, "HoleMain");
          let tool = await this.kernel.translate(mainCyl, px, py, pz - 5);
          this.kernel.release(mainCyl);

          // Se furo cego com ponta de broca 118°
          if (!isThrough && p.bottomTipAngleDeg === 118) {
            const tipH = Math.max(0.5, radius / Math.tan((59 * Math.PI) / 180));
            const tipCone = await this.kernel.createCone(radius, 0.05, tipH, "DrillTip");
            const movedTip = await this.kernel.translate(tipCone, px, py, pz + depth - tipH);
            tool = await this.kernel.fuse(tool, movedTip, "HoleWithTip");
          }

          // Se Counterbore (Rebaixo Cilíndrico para cabeça Allen)
          if (holeType === "counterbore") {
            const cbDia = Math.max(effectiveDia + 2, p.counterboreDiameter || (isoSpec ? isoSpec.counterboreDiaMm : effectiveDia * 1.8));
            const cbDepth = Math.max(1, p.counterboreDepth || (isoSpec ? isoSpec.counterboreDepthMm : effectiveDia * 0.6));
            const cbCyl = await this.kernel.createCylinder(cbDia / 2, cbDepth + 4, true, "Counterbore");
            const movedCb = await this.kernel.translate(cbCyl, px, py, (pos.z ?? 20) - cbDepth);
            tool = await this.kernel.fuse(tool, movedCb, "CounterboreTool");
          }

          // Se Countersink (Escareado Cônico 90°)
          if (holeType === "countersink") {
            const csDia = Math.max(effectiveDia + 2, p.countersinkDiameter || effectiveDia * 2.0);
            const csH = Math.max(1, (csDia - effectiveDia) / 2);
            const csCone = await this.kernel.createCone(radius, csDia / 2, csH + 1, "Countersink");
            const movedCs = await this.kernel.translate(csCone, px, py, (pos.z ?? 20) - csH);
            tool = await this.kernel.fuse(tool, movedCs, "CountersinkTool");
          }

          lastHoleTool = tool;
          resultSolid = await this.kernel.cut(resultSolid, tool, node.name);
        }

        if (lastHoleTool) {
          node.cachedToolShape = lastHoleTool;
        }
        return resultSolid;
      }

      // ----------------------------------------------------
      // 7. ROSCA (COSMÉTICA ISO VS. MODELADA HELICOIDAL 3D)
      // ----------------------------------------------------
      case "thread_feature": {
        if (!inputSolid) {
          throw new Error("O recurso de Rosca requer um cilindro ou furo existente.");
        }
        const p = node.parameters as ThreadFeatureParams & {
          isoSize?: string;
          threadMode?: string;
          position?: { x: number; y: number; z: number };
        };
        const isoKey = (p.isoDesignation || p.isoSize || "M12") as keyof typeof ISO_METRIC_THREADS;
        const spec = ISO_METRIC_THREADS[isoKey] || ISO_METRIC_THREADS.M12;
        const nomDia = Math.max(3, p.nominalDiameter || spec.nominalDiameterMm);
        const pitch = Math.max(0.5, p.pitch || spec.pitchMm);
        const len = Math.max(5, p.length || 40);
        const posZ = p.positionZ ?? p.position?.z ?? 0;
        const isModeled = p.mode === "modeled" || p.threadMode === "modeled_3d";

        // Registra sempre os metadados ISO para Prancha 2D e Inspeção
        node.cosmeticMetadata = {
          threadDesignation: `${isoKey}×${pitch} (${isModeled ? "Modelada 3D" : "Cosmética ISO"})`,
          threadPitchMm: pitch,
          threadLengthMm: len,
          isInternalThread: p.isInternal ?? false,
        };

        if (!isModeled) {
          // Modo 1 — Rosca Cosmética: mantém cilindro liso de alta performance + leve anel chanfrado de indicação ISO
          const ringOuter = await this.kernel.createCylinder(nomDia / 2 + 0.4, 1.0, true, "IsoThreadRing");
          const ringInner = await this.kernel.createCylinder(Math.max(0.5, nomDia / 2 - 0.8), 2.0, true, "IsoThreadRingIn");
          const ring = await this.kernel.cut(ringOuter, ringInner, "IsoRing");
          const placedRing = await this.kernel.translate(ring, 0, 0, posZ + len - 1.5);
          return await this.kernel.cut(inputSolid, placedRing, node.name);
        } else {
          // Modo 2 — Rosca Modelada Geometricamente (Sulcos helicoidais / anéis de passo métrico 60°)
          let threaded = inputSolid;
          const threadDepth = Math.max(0.4, pitch * 0.6134);
          const steps = Math.max(3, Math.min(18, Math.floor(len / Math.max(pitch * 1.5, 2.5))));
          const stepPitch = len / steps;
          for (let i = 0; i < steps; i++) {
            const z = posZ + i * stepPitch;
            const groove = await this.kernel.createTorus(nomDia / 2, Math.max(0.4, threadDepth * 0.85), "ThreadGroove");
            const placedGroove = await this.kernel.translate(groove, 0, 0, z);
            threaded = await this.kernel.cut(threaded, placedGroove, node.name);
          }
          return threaded;
        }
      }

      // ----------------------------------------------------
      // 8. RASGO OBLONGO E CHAVETA DIN 6885 (SLOT / KEYWAY)
      // ----------------------------------------------------
      case "slot_cut": {
        if (!inputSolid) {
          throw new Error("Rasgo / Chaveta requer um sólido base.");
        }
        const p = node.parameters as SlotCutParams & {
          centerX?: number;
          centerY?: number;
          offsetZ?: number;
        };
        const w = Math.max(1, p.width || 8);
        const l = Math.max(w, p.length || 40);
        const d = Math.max(1, p.depth || 15);
        const px = p.position?.x ?? p.centerX ?? 0;
        const py = p.position?.y ?? p.centerY ?? 0;
        const pz = p.position?.z ?? p.offsetZ ?? 0;
        const slotFace = await this.kernel.createSlotFace(
          l,
          w / 2,
          `${node.name}_slot`,
          { x: px, y: py, z: pz - d / 2 },
          { x: 0, y: 0, z: 1 },
        );
        const slotSolid = await this.kernel.extrude(slotFace, 0, 0, d + 10, "SlotTool");
        node.cachedToolShape = slotSolid;
        return await this.kernel.cut(inputSolid, slotSolid, node.name);
      }

      // ----------------------------------------------------
      // 9. MODIFICADORES: FILETE, CHANFRO, CASCA, NERVURA, DRAFT, THICKEN
      // ----------------------------------------------------
      case "fillet": {
        const solid = inputSolid ?? (await this.kernel.createBox(100, 100, 50, true, "Caixa Base"));
        const p = node.parameters as FilletParams;
        const radius = Math.max(0.1, p.radius);
        const edges = p.edgeIndices?.length > 0 ? p.edgeIndices : [0];
        return await this.kernel.fillet(solid, radius, edges, node.name);
      }

      case "chamfer": {
        const solid = inputSolid ?? (await this.kernel.createBox(100, 100, 50, true, "Caixa Base"));
        const p = node.parameters as ChamferParams;
        const distance = Math.max(0.1, p.distance);
        const edges = p.edgeIndices?.length > 0 ? p.edgeIndices : [0];
        if (p.chamferMode && p.chamferMode !== "symmetric") {
          return await this.kernel.chamferAdvanced(
            solid,
            {
              mode: p.chamferMode,
              distance1: distance,
              distance2: p.distance2,
              angleDeg: p.angleDeg,
              edgeIndices: edges,
            },
            node.name,
          );
        }
        return await this.kernel.chamfer(solid, distance, edges, node.name);
      }

      case "shell": {
        if (!inputSolid) {
          throw new Error("A operação Casca (Shell) requer um corpo sólido existente.");
        }
        const p = node.parameters as ShellParams & { wallThickness?: number; openFaceIndices?: number[] };
        const faces = p.faceIndices?.length ? p.faceIndices : p.openFaceIndices;
        return await this.kernel.shell(
          inputSolid,
          Math.max(0.5, p.thickness || p.wallThickness || 3),
          faces?.length ? faces : undefined,
          node.name,
        );
      }

      case "rib": {
        if (!inputSolid) {
          throw new Error("A operação Nervura (Rib) requer um corpo de apoio.");
        }
        const p = node.parameters as RibParams;
        const t = Math.max(1, p.thickness || 8);
        const w = Math.max(5, p.width || 60);
        const h = Math.max(5, p.height || 60);
        const off = p.offset ?? 0;

        // Cria prisma triangular de reforço estrutural (Rib)
        const triPts = [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: 0, y: h },
        ];
        const planeNormal = p.plane === "YZ" ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
        const planeOrigin =
          p.plane === "YZ"
            ? { x: off - t / 2, y: -w / 2, z: 0 }
            : { x: -w / 2, y: off - t / 2, z: 0 };

        const ribFace = await this.kernel.createPolygonFace(triPts, "RibProfile", planeOrigin, planeNormal);
        const ribSolid =
          p.plane === "YZ"
            ? await this.kernel.extrude(ribFace, t, 0, 0, node.name)
            : await this.kernel.extrude(ribFace, 0, t, 0, node.name);
        node.cachedToolShape = ribSolid;
        return await this.kernel.fuse(inputSolid, ribSolid, node.name);
      }

      case "draft": {
        if (!inputSolid) throw new Error("Inclinação (Draft) requer um sólido base.");
        const p = node.parameters as DraftParams;
        const factor = 1 + Math.tan(((p.angleDeg || 5) * Math.PI) / 180) * 0.05;
        return await this.kernel.scale(inputSolid, { x: 0, y: 0, z: 0 }, Math.max(0.5, Math.min(1.5, factor)));
      }

      case "thicken": {
        if (!inputSolid) throw new Error("Espessamento (Thicken) requer uma superfície ou sólido base.");
        const p = node.parameters as ThickenParams;
        return await this.kernel.thicken(inputSolid, p.thickness || 2, node.name);
      }

      case "edge_flange": {
        if (!inputSolid) throw new Error("Flange de Aresta requer uma chapa base.");
        const p = node.parameters as EdgeFlangeParams & { length?: number };
        const bbox = await this.kernel.getBoundingBox(inputSolid);
        const t = Math.max(0.5, p.thickness || 3);
        const len = Math.max(5, p.flangeLength || p.length || 45);
        let flangeBox: CadShape;
        if (p.edgePosition === "left" || p.edgePosition === "right") {
          const xPos = p.edgePosition === "right" ? bbox.max.x - t / 2 : bbox.min.x + t / 2;
          const b = await this.kernel.createBox(t, bbox.size.y, len, true, "EdgeFlange");
          flangeBox = await this.kernel.translate(b, xPos, (bbox.min.y + bbox.max.y) / 2, bbox.max.z + len / 2 - t);
        } else {
          const yPos = p.edgePosition === "back" ? bbox.max.y - t / 2 : bbox.min.y + t / 2;
          const b = await this.kernel.createBox(bbox.size.x, t, len, true, "EdgeFlange");
          flangeBox = await this.kernel.translate(b, (bbox.min.x + bbox.max.x) / 2, yPos, bbox.max.z + len / 2 - t);
        }
        node.cachedToolShape = flangeBox;
        return await this.kernel.fuse(inputSolid, flangeBox, node.name);
      }

      // ----------------------------------------------------
      // 10. PADRÕES PARAMÉTRICOS (LINEAR, CIRCULAR) & ESPELHAMENTO
      // ----------------------------------------------------
      case "linear_pattern": {
        if (!inputSolid) throw new Error("Padrão Linear requer um sólido base.");
        const p = node.parameters as LinearPatternParams & {
          direction1?: { x: number; y: number; z: number } | "X" | "Y" | "Z";
          direction2?: { x: number; y: number; z: number } | "X" | "Y" | "Z";
        };
        const count1 = Math.max(1, Math.min(25, Math.round(p.count1 || 3)));
        const spacing1 = p.spacing1 || 40;
        const count2 = Math.max(1, Math.min(15, Math.round(p.count2 || 1)));
        const spacing2 = p.spacing2 || 40;
        const d1 =
          typeof p.direction1 === "string"
            ? p.direction1 === "Y"
              ? { x: 0, y: 1, z: 0 }
              : p.direction1 === "Z"
                ? { x: 0, y: 0, z: 1 }
                : { x: 1, y: 0, z: 0 }
            : p.direction1 || { x: 1, y: 0, z: 0 };
        const d2 =
          typeof p.direction2 === "string"
            ? p.direction2 === "X"
              ? { x: 1, y: 0, z: 0 }
              : p.direction2 === "Z"
                ? { x: 0, y: 0, z: 1 }
                : { x: 0, y: 1, z: 0 }
            : p.direction2 || { x: 0, y: 1, z: 0 };

        // Localiza o recurso-alvo a repetir (ou o último furo/ressalto)
        const targetNode = p.targetFeatureId
          ? this.features.find((f) => f.id === p.targetFeatureId)
          : [...this.features]
              .slice(0, node.order)
              .reverse()
              .find((f) => f.cachedToolShape && !f.isSuppressed);

        const isCutFeature =
          targetNode?.type === "hole_cut" ||
          targetNode?.type === "hole_wizard" ||
          targetNode?.type === "cut_extrude" ||
          targetNode?.type === "slot_cut";

        const baseTool = targetNode?.cachedToolShape ?? inputSolid;
        let result = inputSolid;

        for (let i = 0; i < count1; i++) {
          for (let j = 0; j < count2; j++) {
            if (i === 0 && j === 0) continue; // Instância original já aplicada
            const instIdx = i * count2 + j;
            if (p.skipInstances?.includes(instIdx)) continue;

            const dx = i * spacing1 * d1.x + j * spacing2 * d2.x;
            const dy = i * spacing1 * d1.y + j * spacing2 * d2.y;
            const dz = i * spacing1 * d1.z + j * spacing2 * d2.z;

            const copyShape = await this.kernel.translate(baseTool, dx, dy, dz);
            result = isCutFeature
              ? await this.kernel.cut(result, copyShape, node.name)
              : await this.kernel.fuse(result, copyShape, node.name);
            this.kernel.release(copyShape);
          }
        }
        return result;
      }

      case "circular_pattern": {
        if (!inputSolid) throw new Error("Padrão Circular requer um sólido base.");
        const p = node.parameters as CircularPatternParams;
        const count = Math.max(2, Math.min(36, Math.round(p.count || 6)));
        const totalDeg = Math.max(10, Math.min(360, p.totalAngleDeg || 360));
        const stepRad = ((totalDeg / count) * Math.PI) / 180;
        const center = p.center || { x: 0, y: 0, z: 0 };
        const axisDir =
          p.axis === "X"
            ? { x: 1, y: 0, z: 0 }
            : p.axis === "Y"
              ? { x: 0, y: 1, z: 0 }
              : { x: 0, y: 0, z: 1 };

        const targetNode = p.targetFeatureId
          ? this.features.find((f) => f.id === p.targetFeatureId)
          : [...this.features]
              .slice(0, node.order)
              .reverse()
              .find((f) => f.cachedToolShape && !f.isSuppressed);

        const isCutFeature =
          targetNode?.type === "hole_cut" ||
          targetNode?.type === "hole_wizard" ||
          targetNode?.type === "cut_extrude" ||
          targetNode?.type === "slot_cut";

        const baseTool = targetNode?.cachedToolShape ?? inputSolid;
        let result = inputSolid;

        for (let i = 1; i < count; i++) {
          const rotShape = await this.kernel.rotate(baseTool, center, axisDir, i * stepRad);
          result = isCutFeature
            ? await this.kernel.cut(result, rotShape, node.name)
            : await this.kernel.fuse(result, rotShape, node.name);
          this.kernel.release(rotShape);
        }
        return result;
      }

      case "mirror_feature": {
        if (!inputSolid) throw new Error("Espelhamento (Mirror) requer um sólido base.");
        const p = node.parameters as MirrorFeatureParams;
        const offset = p.planeOffset ?? 0;
        const planeNormal =
          p.mirrorPlane === "YZ"
            ? { x: 1, y: 0, z: 0 }
            : p.mirrorPlane === "XZ"
              ? { x: 0, y: 1, z: 0 }
              : { x: 0, y: 0, z: 1 };
        const planePoint = {
          x: planeNormal.x * offset,
          y: planeNormal.y * offset,
          z: planeNormal.z * offset,
        };

        const targetNode =
          !p.mirrorEntireBody && p.targetFeatureId
            ? this.features.find((f) => f.id === p.targetFeatureId)
            : null;

        const shapeToMirror = targetNode?.cachedToolShape ?? inputSolid;
        const isCutFeature =
          targetNode?.type === "hole_cut" ||
          targetNode?.type === "hole_wizard" ||
          targetNode?.type === "cut_extrude";

        const mirrored = await this.kernel.mirror(shapeToMirror, planePoint, planeNormal);
        if (isCutFeature) {
          return await this.kernel.cut(inputSolid, mirrored, node.name);
        }
        return await this.kernel.fuse(inputSolid, mirrored, node.name);
      }

      case "transform": {
        if (!inputSolid) {
          throw new Error("Transformação requer um sólido de suporte.");
        }
        const p = node.parameters as TransformParams;
        let res = inputSolid;
        if (p.dx !== 0 || p.dy !== 0 || p.dz !== 0) {
          res = await this.kernel.translate(res, p.dx || 0, p.dy || 0, p.dz || 0);
        }
        if (p.rz) {
          res = await this.kernel.rotate(res, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, (p.rz * Math.PI) / 180);
        }
        return res;
      }

      // ----------------------------------------------------
      // 11. CALDEIRARIA INDUSTRIAL & ESTRUTURAS METÁLICAS
      // ----------------------------------------------------
      case "boilermaking_cone": {
        const p = node.parameters as unknown as BoilermakingConeParams;
        return await CaldraBoilermakingBRep.createTruncatedCone(p);
      }

      case "boilermaking_transition": {
        const p = node.parameters as unknown as BoilermakingTransitionParams;
        return await CaldraBoilermakingBRep.createSquareToRound(p);
      }

      case "boilermaking_elbow": {
        const p = node.parameters as unknown as BoilermakingElbowParams;
        return await CaldraBoilermakingBRep.createSegmentedElbow(p);
      }

      case "boilermaking_branch": {
        const p = node.parameters as unknown as BoilermakingBranchParams;
        return await CaldraBoilermakingBRep.createCylindricalBranch(p);
      }

      case "boilermaking_hood": {
        const p = node.parameters as unknown as BoilermakingHoodParams;
        return await CaldraBoilermakingBRep.createConicalHood(p);
      }

      case "weldment_beam": {
        const p = node.parameters as unknown as WeldmentBeamParams;
        return await CaldraWeldmentBridge.createStructuralBeam(p);
      }

      case "weldment_frame": {
        const p = node.parameters as unknown as WeldmentFrameParams;
        return await CaldraWeldmentBridge.createStructuralFrame(p);
      }

      default:
        if (inputSolid) return inputSolid;
        throw new Error(`Tipo de recurso desconhecido: ${String(node.type)}`);
    }
  }

  // ==========================================
  // SERIALIZAÇÃO & PERSISTÊNCIA DA ÁRVORE PARAMÉTRICA
  // ==========================================

  public serializeTree(): string {
    return JSON.stringify({
      schemaVersion: "2.0.0",
      rollbackIndex: this.rollbackIndex,
      activeBodyId: this.activeBodyId,
      bodies: Array.from(this.bodies.values()).map((b) => ({
        id: b.id,
        name: b.name,
        isActive: b.isActive,
        isVisible: b.isVisible,
        material: b.material,
        status: b.status,
        featureIds: b.featureIds,
      })),
      mates: this.mates,
      features: this.features.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        order: f.order,
        isSuppressed: f.isSuppressed,
        bodyId: f.bodyId,
        parameters: f.parameters,
        dependencies: f.dependencies,
        references: f.references,
        semanticReferences: f.semanticReferences,
        cosmeticMetadata: f.cosmeticMetadata,
      })),
    });
  }

  public deserializeTree(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (!data || !Array.isArray(data.features)) return false;
      this.dispose();
      if (Array.isArray(data.bodies)) {
        this.bodies.clear();
        for (const b of data.bodies) {
          this.bodies.set(b.id, { ...b, shape: null, massProperties: null });
        }
      }
      this.ensureDefaultBody();
      if (data.activeBodyId) this.activeBodyId = data.activeBodyId;
      if (Array.isArray(data.mates)) this.mates = data.mates;

      for (const f of data.features) {
        this.addFeature({
          id: f.id,
          name: f.name,
          type: f.type,
          parameters: f.parameters,
          bodyId: f.bodyId,
          dependencies: f.dependencies,
          references: f.references,
          semanticReferences: f.semanticReferences,
          isSuppressed: f.isSuppressed,
        });
      }
      if (typeof data.rollbackIndex === "number") {
        this.setRollbackIndex(data.rollbackIndex);
      }
      return true;
    } catch {
      return false;
    }
  }

  public async toCadDocument(docName = "Modelo_Parametrico"): Promise<any> {
    const { CadDocument } = await import("../document/CadDocument");
    const doc = new CadDocument({ name: docName, kernel: this.kernel });
    for (const f of this.features) {
      doc.addFeature({
        name: f.name,
        type: f.type,
        parameters: f.parameters,
        dependencies: f.dependencies,
      });
    }
    return doc;
  }

  // ==========================================
  // DISPOSE
  // ==========================================

  public dispose(): void {
    for (const f of this.features) {
      if (f.cachedShape) {
        try {
          this.kernel.release(f.cachedShape);
        } catch {
          // Ignora
        }
        f.cachedShape = undefined;
      }
      if (f.cachedToolShape) {
        try {
          this.kernel.release(f.cachedToolShape);
        } catch {
          // Ignora
        }
        f.cachedToolShape = undefined;
      }
    }
    this.features = [];
    this.activeFinalShape = null;
    this.rollbackIndex = -1;
  }
}
