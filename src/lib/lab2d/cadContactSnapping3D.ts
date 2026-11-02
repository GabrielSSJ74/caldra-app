/**
 * CALDRA CHAMFER CAD — SISTEMA DE SNAPS DE ENCOSTO SUAVES (CONTACT/FLUSH SNAP)
 * E GUIAS DINÂMICAS DE ALINHAMENTO COLINEAR (3D SOFT-MAGNETIC)
 *
 * Características:
 *  - Calibração "Não Tão Magnética": limiar curto de 6px a 8px na tela (~3 mm a 5 mm no espaço 3D).
 *  - Fora do limiar curto, o movimento é 100% livre, suave e contínuo (de 1 em 1 mm).
 *  - Histerese suave (Soft Release): descola suavemente sem solavanco quando o usuário puxa além do limiar.
 *  - Snap de Encosto Físico (Face-com-Face e Quina-com-Quina): encosta matematicamente com distância 0.00 mm
 *    sem atravessar e sem deixar frestas, exibindo contorno ciano de contato.
 *  - Linhas Guias de Alinhamento: detecta colinearidade nos eixos X, Y ou Z entre centros e bordas
 *    de corpos distintos, projetando linhas tracejadas sutis.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { DirectBody3D, DirectFace3D, Vec3Mm } from "./cadDirectModeling3D";

export interface ContactSnapResult3D {
  /** Deslocamento ajustado após considerar os snaps suaves de encosto e alinhamento */
  snappedDelta: Vec3Mm;
  /** Se algum snap de encosto face-com-face ou quina-com-quina foi ativado */
  hasContactSnap: boolean;
  /** Se algum alinhamento colinear em X, Y ou Z foi ativado */
  hasAlignmentSnap: boolean;
  /** Linha ou par de pontos que delimitam a superfície de encosto detectada */
  contactHighlight?: {
    pointStart: Vec3Mm;
    pointEnd: Vec3Mm;
    label: string;
    targetBodyName?: string;
  };
  /** Guias tracejadas de alinhamento dinâmico ligando as peças colineares */
  alignmentGuides: {
    axis: "x" | "y" | "z";
    startPt: Vec3Mm;
    endPt: Vec3Mm;
    label: string;
  }[];
}

/**
 * Calcula a distância euclidiana entre dois pontos 3D.
 */
export function dist3D(a: Vec3Mm, b: Vec3Mm): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Resolve o snap de encosto suave (Flush/Contact Snap) e guias de alinhamento
 * para a movimentação de um corpo ou translação nos eixos.
 *
 * @param movingBody Corpo sendo movido
 * @param otherBodies Demais corpos estáticos da cena
 * @param rawDelta Deslocamento solicitado pelo arraste do usuário
 * @param pixelsPerMm Escala da tela atual (para calibrar o limiar de 6px a 8px)
 * @param snapThresholdPx Limiar em pixels na tela (padrão: 7px)
 */
export function resolveContactAndAlignmentSnaps3D(
  movingBody: DirectBody3D,
  otherBodies: DirectBody3D[],
  rawDelta: Vec3Mm,
  pixelsPerMm: number,
  snapThresholdPx = 7.5,
): ContactSnapResult3D {
  const result: ContactSnapResult3D = {
    snappedDelta: { ...rawDelta },
    hasContactSnap: false,
    hasAlignmentSnap: false,
    alignmentGuides: [],
  };

  if (otherBodies.length === 0) return result;

  const scale = Math.max(0.05, pixelsPerMm);
  // Limiar de captura curto (entre 2.5 mm e 5.0 mm em escala normal de visualização)
  const thresholdMm = Math.max(2.0, Math.min(8.0, snapThresholdPx / scale));

  // Posição prevista da Bounding Box do corpo movido
  const predBbox = {
    minX: movingBody.bbox3D.minX + rawDelta.x,
    maxX: movingBody.bbox3D.maxX + rawDelta.x,
    minY: movingBody.bbox3D.minY + rawDelta.y,
    maxY: movingBody.bbox3D.maxY + rawDelta.y,
    minZ: movingBody.bbox3D.minZ + rawDelta.z,
    maxZ: movingBody.bbox3D.maxZ + rawDelta.z,
  };
  const predCenter = {
    x: (predBbox.minX + predBbox.maxX) * 0.5,
    y: (predBbox.minY + predBbox.maxY) * 0.5,
    z: (predBbox.minZ + predBbox.maxZ) * 0.5,
  };

  let bestContactSnapX: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;
  let bestContactSnapY: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;
  let bestContactSnapZ: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;

  for (const other of otherBodies) {
    if (other.bodyId === movingBody.bodyId || other.entityId === movingBody.entityId) continue;

    const ob = other.bbox3D;
    const oCenter = {
      x: (ob.minX + ob.maxX) * 0.5,
      y: (ob.minY + ob.maxY) * 0.5,
      z: (ob.minZ + ob.maxZ) * 0.5,
    };

    // -------------------------------------------------------------------------
    // 1. SNAP DE ENCOSTO EM X (Face Direita com Face Esquerda, ou Face Esquerda com Face Direita)
    // -------------------------------------------------------------------------
    const overlapYZ =
      predBbox.minY <= ob.maxY + 10 &&
      predBbox.maxY >= ob.minY - 10 &&
      predBbox.minZ <= ob.maxZ + 10 &&
      predBbox.maxZ >= ob.minZ - 10;

    if (overlapYZ) {
      // Caso 1a: Face Direita da peça movida encosta na Face Esquerda da outra (maxX -> ob.minX)
      const gapRightToLeft = ob.minX - predBbox.maxX;
      if (Math.abs(gapRightToLeft) <= thresholdMm) {
        if (!bestContactSnapX || Math.abs(gapRightToLeft) < bestContactSnapX.distMm) {
          bestContactSnapX = {
            delta: rawDelta.x + gapRightToLeft,
            distMm: Math.abs(gapRightToLeft),
            highlight: {
              pointStart: { x: ob.minX, y: Math.max(predBbox.minY, ob.minY), z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: ob.minX, y: Math.min(predBbox.maxY, ob.maxY), z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face X=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }

      // Caso 1b: Face Esquerda da peça movida encosta na Face Direita da outra (minX -> ob.maxX)
      const gapLeftToRight = ob.maxX - predBbox.minX;
      if (Math.abs(gapLeftToRight) <= thresholdMm) {
        if (!bestContactSnapX || Math.abs(gapLeftToRight) < bestContactSnapX.distMm) {
          bestContactSnapX = {
            delta: rawDelta.x + gapLeftToRight,
            distMm: Math.abs(gapLeftToRight),
            highlight: {
              pointStart: { x: ob.maxX, y: Math.max(predBbox.minY, ob.minY), z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: ob.maxX, y: Math.min(predBbox.maxY, ob.maxY), z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face X=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. SNAP DE ENCOSTO EM Y (Face Frontal com Face Traseira)
    // -------------------------------------------------------------------------
    const overlapXZ =
      predBbox.minX <= ob.maxX + 10 &&
      predBbox.maxX >= ob.minX - 10 &&
      predBbox.minZ <= ob.maxZ + 10 &&
      predBbox.maxZ >= ob.minZ - 10;

    if (overlapXZ) {
      // Caso 2a: Face Superior/Topo Y da peça movida encosta na Base Y da outra
      const gapTopToBottom = ob.minY - predBbox.maxY;
      if (Math.abs(gapTopToBottom) <= thresholdMm) {
        if (!bestContactSnapY || Math.abs(gapTopToBottom) < bestContactSnapY.distMm) {
          bestContactSnapY = {
            delta: rawDelta.y + gapTopToBottom,
            distMm: Math.abs(gapTopToBottom),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: ob.minY, z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: ob.minY, z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face Y=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }

      // Caso 2b: Face Base Y da peça movida encosta no Topo Y da outra
      const gapBottomToTop = ob.maxY - predBbox.minY;
      if (Math.abs(gapBottomToTop) <= thresholdMm) {
        if (!bestContactSnapY || Math.abs(gapBottomToTop) < bestContactSnapY.distMm) {
          bestContactSnapY = {
            delta: rawDelta.y + gapBottomToTop,
            distMm: Math.abs(gapBottomToTop),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: ob.maxY, z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: ob.maxY, z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face Y=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. SNAP DE ENCOSTO EM Z (Assentamento de Topo / Base Z=0)
    // -------------------------------------------------------------------------
    const overlapXY =
      predBbox.minX <= ob.maxX + 10 &&
      predBbox.maxX >= ob.minX - 10 &&
      predBbox.minY <= ob.maxY + 10 &&
      predBbox.maxY >= ob.minY - 10;

    if (overlapXY) {
      // Base da peça pousa exatamente no topo da outra peça (ex.: viga apoiando em cima da sapata/coluna)
      const gapBottomPousa = ob.maxZ - predBbox.minZ;
      if (Math.abs(gapBottomPousa) <= thresholdMm) {
        if (!bestContactSnapZ || Math.abs(gapBottomPousa) < bestContactSnapZ.distMm) {
          bestContactSnapZ = {
            delta: rawDelta.z + gapBottomPousa,
            distMm: Math.abs(gapBottomPousa),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: Math.max(predBbox.minY, ob.minY), z: ob.maxZ },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: Math.min(predBbox.maxY, ob.maxY), z: ob.maxZ },
              label: `Apoio Topo Z=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4. GUIAS DINÂMICAS DE ALINHAMENTO COLINEAR SUAVE
    // -------------------------------------------------------------------------
    // Alinhamento dos Centros em X
    const diffCenterX = Math.abs(predCenter.x - oCenter.x);
    if (diffCenterX <= thresholdMm && !bestContactSnapX) {
      result.snappedDelta.x = rawDelta.x + (oCenter.x - predCenter.x);
      result.hasAlignmentSnap = true;
      result.alignmentGuides.push({
        axis: "x",
        startPt: { x: oCenter.x, y: predCenter.y, z: predCenter.z },
        endPt: { x: oCenter.x, y: oCenter.y, z: oCenter.z },
        label: `Alinhado Centro X`,
      });
    }

    // Alinhamento dos Centros em Y
    const diffCenterY = Math.abs(predCenter.y - oCenter.y);
    if (diffCenterY <= thresholdMm && !bestContactSnapY) {
      result.snappedDelta.y = rawDelta.y + (oCenter.y - predCenter.y);
      result.hasAlignmentSnap = true;
      result.alignmentGuides.push({
        axis: "y",
        startPt: { x: predCenter.x, y: oCenter.y, z: predCenter.z },
        endPt: { x: oCenter.x, y: oCenter.y, z: oCenter.z },
        label: `Alinhado Centro Y`,
      });
    }

    // Alinhamento dos Centros em Z
    const diffCenterZ = Math.abs(predCenter.z - oCenter.z);
    if (diffCenterZ <= thresholdMm && !bestContactSnapZ) {
      result.snappedDelta.z = rawDelta.z + (oCenter.z - predCenter.z);
      result.hasAlignmentSnap = true;
      result.alignmentGuides.push({
        axis: "z",
        startPt: { x: predCenter.x, y: predCenter.y, z: oCenter.z },
        endPt: { x: oCenter.x, y: oCenter.y, z: oCenter.z },
        label: `Alinhado Nível Z`,
      });
    }
  }

  // Aplica os snaps de encosto físico que superam o alinhamento
  if (bestContactSnapX) {
    result.snappedDelta.x = bestContactSnapX.delta;
    result.hasContactSnap = true;
    if (bestContactSnapX.highlight) {
      result.contactHighlight = bestContactSnapX.highlight;
    }
  }
  if (bestContactSnapY) {
    result.snappedDelta.y = bestContactSnapY.delta;
    result.hasContactSnap = true;
    if (bestContactSnapY.highlight) {
      result.contactHighlight = bestContactSnapY.highlight;
    }
  }
  if (bestContactSnapZ) {
    result.snappedDelta.z = bestContactSnapZ.delta;
    result.hasContactSnap = true;
    if (bestContactSnapZ.highlight) {
      result.contactHighlight = bestContactSnapZ.highlight;
    }
  }

  return result;
}

/**
 * Snap suave de encosto específico para o esticamento de Face (Offset Face).
 * Ex.: Quando a face de topo ou lateral de uma viga é esticada até encostar na face de uma coluna (ex.: 599 mm).
 */
export function resolveFaceStretchContactSnap(
  face: DirectFace3D,
  currentOffsetMm: number,
  otherBodies: DirectBody3D[],
  pixelsPerMm: number,
  snapThresholdPx = 7.5,
): { snappedOffsetMm: number; hasSnap: boolean; snapTargetName?: string } {
  const scale = Math.max(0.05, pixelsPerMm);
  const thresholdMm = Math.max(2.5, Math.min(8.0, snapThresholdPx / scale));

  // Ponto previsto do centroide da face após o offset
  const normal = face.normal;

  for (const other of otherBodies) {
    if (other.entityId === face.entityId || other.bodyId === face.bodyId) continue;

    // Compara com as faces do outro corpo que possuem normal oposta
    for (const otherFace of other.faces) {
      const dot =
        normal.x * otherFace.normal.x +
        normal.y * otherFace.normal.y +
        normal.z * otherFace.normal.z;

      // Se as faces são opostas (dot < -0.7)
      if (dot < -0.7) {
        // Distância projetada na direção normal
        const dX = otherFace.centroid.x - face.centroid.x;
        const dY = otherFace.centroid.y - face.centroid.y;
        const dZ = otherFace.centroid.z - face.centroid.z;
        const targetDistMm = dX * normal.x + dY * normal.y + dZ * normal.z;

        if (targetDistMm > 0 && Math.abs(currentOffsetMm - targetDistMm) <= thresholdMm) {
          return {
            snappedOffsetMm: Number(targetDistMm.toFixed(2)),
            hasSnap: true,
            snapTargetName: other.name,
          };
        }
      }
    }
  }

  return { snappedOffsetMm: currentOffsetMm, hasSnap: false };
}
