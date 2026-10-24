/**
 * CALDRA CAD — CAD B-REP EDITOR & COMMAND DISPATCHER (FASE 06 — PARAMÉTRICO COMBINÁVEL)
 *
 * Camada de comando e orquestração de edição paramétrica B-Rep.
 * Conecta a interação do usuário na interface CAD 3D e no Gizmo ao motor analítico
 * do OpenCascade (OCCT), garantindo reconstrução geométrica determinística real
 * com snapshots completos da Árvore de Recursos (Undo / Redo sem perda de topologia).
 */

import { CadFeatureTree } from "../features/CadFeatureTree";
import type { CadFeatureInput, CadFeatureParams } from "../features/CadFeatureModel";

export interface CadEditSnapshot {
  serializedTreeJson: string;
  rollbackIndex: number;
  timestamp: number;
}

export class CadBRepEditor {
  private tree: CadFeatureTree;
  private undoStack: CadEditSnapshot[] = [];
  private redoStack: CadEditSnapshot[] = [];
  private maxHistory = 35;

  constructor(tree: CadFeatureTree) {
    this.tree = tree;
  }

  /** Cria snapshot imutável completo do estado atual da árvore (recursos, corpos, mates, refs semânticas) */
  private createSnapshot(): CadEditSnapshot {
    return {
      serializedTreeJson: this.tree.serializeTree(),
      rollbackIndex: this.tree.getRollbackIndex(),
      timestamp: Date.now(),
    };
  }

  /** Registra um ponto de restauração antes de uma nova mutação */
  public pushUndo(): void {
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Desfaz a última alteração geométrica */
  public async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;
    this.redoStack.push(this.createSnapshot());
    const target = this.undoStack.pop()!;
    await this.restoreSnapshot(target);
    return true;
  }

  /** Refaz a alteração desfeita */
  public async redo(): Promise<boolean> {
    if (!this.canRedo()) return false;
    this.undoStack.push(this.createSnapshot());
    const target = this.redoStack.pop()!;
    await this.restoreSnapshot(target);
    return true;
  }

  private async restoreSnapshot(snapshot: CadEditSnapshot): Promise<void> {
    this.tree.deserializeTree(snapshot.serializedTreeJson);
    this.tree.setRollbackIndex(snapshot.rollbackIndex);
    await this.tree.rebuild();
  }

  /** Adiciona qualquer recurso paramétrico combinável com suporte a Undo */
  public async addParametricFeature(input: CadFeatureInput): Promise<string> {
    this.pushUndo();
    const added = this.tree.addFeature(input);
    await this.tree.rebuild();
    return added.id;
  }

  /** Atualiza parâmetros de um recurso existente com propagação incremental */
  public async updateParametricFeature(
    featureId: string,
    newParams: Partial<CadFeatureParams>,
  ): Promise<boolean> {
    this.pushUndo();
    const ok = this.tree.updateFeature(featureId, newParams);
    if (!ok) return false;
    await this.tree.rebuild();
    return true;
  }

  /**
   * EDIÇÃO VIA GIZMO / PUSH-PULL DE FACE:
   * Atualiza o bloco base se aplicável ou adiciona uma extrusão/transformação na árvore.
   */
  public async applyFacePushPull(
    faceIndex: number,
    delta: { x: number; y: number; z: number },
    normal?: { x: number; y: number; z: number },
  ): Promise<boolean> {
    const features = this.tree.getFeatures();
    const baseBox = features.find((f) => f.type === "base_box");
    const baseExtrude = features.find((f) => f.type === "extrude_sketch");

    this.pushUndo();

    if (baseExtrude && (!normal || Math.abs(normal.z) > 0.5)) {
      const p = { ...(baseExtrude.parameters as { depth?: number }) };
      const change = normal ? (normal.z >= 0 ? delta.z : -delta.z) : delta.z;
      p.depth = Math.max(0.5, (p.depth || 3) + change);
      this.tree.updateFeature(baseExtrude.id, p);
      await this.tree.rebuild();
      return true;
    } else if (baseBox) {
      const p = { ...(baseBox.parameters as { width: number; length: number; height: number }) };
      if (normal && Math.abs(normal.z) > 0.7) {
        const change = normal.z > 0 ? delta.z : -delta.z;
        p.height = Math.max(1, p.height + change);
      } else if (normal && Math.abs(normal.x) > 0.7) {
        const change = normal.x > 0 ? delta.x : -delta.x;
        p.width = Math.max(1, p.width + change);
      } else if (normal && Math.abs(normal.y) > 0.7) {
        const change = normal.y > 0 ? delta.y : -delta.y;
        p.length = Math.max(1, p.length + change);
      } else {
        if (Math.abs(delta.z) >= Math.abs(delta.x) && Math.abs(delta.z) >= Math.abs(delta.y)) {
          p.height = Math.max(1, p.height + delta.z);
        } else if (Math.abs(delta.x) >= Math.abs(delta.y)) {
          p.width = Math.max(1, p.width + delta.x);
        } else {
          p.length = Math.max(1, p.length + delta.y);
        }
      }

      this.tree.updateFeature(baseBox.id, p);
      await this.tree.rebuild();
      return true;
    } else {
      this.tree.addFeature({
        name: `Deslocamento Face #${faceIndex}`,
        type: "transform",
        parameters: { dx: delta.x, dy: delta.y, dz: delta.z },
      });
      await this.tree.rebuild();
      return true;
    }
  }

  /** Aplicação de Filete (Arredondamento / Concordância) */
  public async applyFillet(edgeIndices: number[], radius: number): Promise<boolean> {
    if (edgeIndices.length === 0 || radius <= 0) return false;
    this.pushUndo();

    this.tree.addFeature({
      name: `Filete R${radius} mm (${edgeIndices.length} arestas)`,
      type: "fillet",
      parameters: { radius, edgeIndices },
    });

    await this.tree.rebuild();
    return true;
  }

  /** Aplicação de Chanfro (Quebra de canto linear) */
  public async applyChamfer(edgeIndices: number[], distance: number): Promise<boolean> {
    if (edgeIndices.length === 0 || distance <= 0) return false;
    this.pushUndo();

    this.tree.addFeature({
      name: `Chanfro ${distance} mm (${edgeIndices.length} arestas)`,
      type: "chamfer",
      parameters: { distance, edgeIndices },
    });

    await this.tree.rebuild();
    return true;
  }

  /** Adição de Furo Cilíndrico ou ISO (Hole Wizard) */
  public async addHole(
    diameter: number,
    depth: number,
    position: { x: number; y: number; z: number },
    isThrough = true,
  ): Promise<boolean> {
    if (diameter <= 0 || depth <= 0) return false;
    this.pushUndo();

    this.tree.addFeature({
      name: `Furo Ø${diameter} mm`,
      type: "hole_cut",
      parameters: {
        diameter,
        depth,
        position,
        isThrough,
      },
    });

    await this.tree.rebuild();
    return true;
  }

  /** Alteração de espessura de chapa (Caldeiraria) */
  public async setSheetThickness(newThickness: number): Promise<boolean> {
    if (newThickness <= 0) return false;
    const features = this.tree.getFeatures();
    const baseExtrude = features.find((f) => f.type === "extrude_sketch");
    if (baseExtrude) {
      this.pushUndo();
      this.tree.updateFeature(baseExtrude.id, {
        ...baseExtrude.parameters,
        depth: newThickness,
      });
      await this.tree.rebuild();
      return true;
    }

    const baseBox = features.find((f) => f.type === "base_box");
    if (baseBox) {
      this.pushUndo();
      const p = { ...(baseBox.parameters as { width: number; length: number; height: number }) };
      p.height = newThickness;
      this.tree.updateFeature(baseBox.id, p);
      await this.tree.rebuild();
      return true;
    }
    return false;
  }
}
