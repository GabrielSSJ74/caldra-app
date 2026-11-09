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
  /** Rótulo resumido do snap ativo para exibição no badge (ex.: "Snap Z: Topo (300.00 mm)") */
  snapBadgeLabel?: string;
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
 * para a movimentação de um corpo ou translação nos eixos X, Y e Z.
 *
 * @param movingBody Corpo sendo movido
 * @param otherBodies Demais corpos estáticos da cena
 * @param rawDelta Deslocamento solicitado pelo arraste do usuário
 * @param pixelsPerMm Escala da tela atual (para calibrar o limiar de 6px a 8px)
 * @param snapThresholdPx Limiar em pixels na tela (padrão: 6px)
 */
export function resolveContactAndAlignmentSnaps3D(
  movingBody: DirectBody3D,
  otherBodies: DirectBody3D[],
  rawDelta: Vec3Mm,
  pixelsPerMm: number,
  snapThresholdPx = 6,
  customPivot3D?: Vec3Mm | null,
): ContactSnapResult3D {
  const result: ContactSnapResult3D = {
    snappedDelta: { ...rawDelta },
    hasContactSnap: false,
    hasAlignmentSnap: false,
    alignmentGuides: [],
  };

  if (otherBodies.length === 0) return result;

  const scale = Math.max(0.05, pixelsPerMm);
  // Limiar de captura curto (~6px na tela, ~3.5 mm a 6.5 mm no espaço 3D)
  const thresholdMm = Math.max(2.5, Math.min(6.5, snapThresholdPx / scale));

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
  const predCustomPivot = customPivot3D
    ? {
        x: customPivot3D.x + rawDelta.x,
        y: customPivot3D.y + rawDelta.y,
        z: customPivot3D.z + rawDelta.z,
      }
    : null;

  let bestContactSnapX: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;
  let bestContactSnapY: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;
  let bestContactSnapZ: { delta: number; distMm: number; highlight?: ContactSnapResult3D["contactHighlight"] } | null = null;

  let bestAlignX: { delta: number; distMm: number; guide: ContactSnapResult3D["alignmentGuides"][number] } | null = null;
  let bestAlignY: { delta: number; distMm: number; guide: ContactSnapResult3D["alignmentGuides"][number] } | null = null;
  let bestAlignZ: { delta: number; distMm: number; guide: ContactSnapResult3D["alignmentGuides"][number] } | null = null;

  for (const other of otherBodies) {
    if (other.bodyId === movingBody.bodyId || other.entityId === movingBody.entityId) continue;

    const ob = other.bbox3D;
    const oCenter = {
      x: (ob.minX + ob.maxX) * 0.5,
      y: (ob.minY + ob.maxY) * 0.5,
      z: (ob.minZ + ob.maxZ) * 0.5,
    };

    // -------------------------------------------------------------------------
    // 0. SNAP DIRETO DO PIVÔ NA QUINA / BORDA CONTRA QUINA OU FACE DE OUTRA PEÇA
    // -------------------------------------------------------------------------
    if (predCustomPivot) {
      for (const cand of other.snapCandidates) {
        const dxCand = cand.point3D.x - predCustomPivot.x;
        const dyCand = cand.point3D.y - predCustomPivot.y;
        const dzCand = cand.point3D.z - predCustomPivot.z;
        if (Math.abs(dxCand) <= thresholdMm && (!bestContactSnapX || Math.abs(dxCand) < bestContactSnapX.distMm)) {
          bestContactSnapX = {
            delta: rawDelta.x + dxCand,
            distMm: Math.abs(dxCand),
            highlight: {
              pointStart: cand.point3D,
              pointEnd: { x: cand.point3D.x, y: predCustomPivot.y, z: predCustomPivot.z },
              label: `Encosto Quina X=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
        if (Math.abs(dyCand) <= thresholdMm && (!bestContactSnapY || Math.abs(dyCand) < bestContactSnapY.distMm)) {
          bestContactSnapY = {
            delta: rawDelta.y + dyCand,
            distMm: Math.abs(dyCand),
            highlight: {
              pointStart: cand.point3D,
              pointEnd: { x: predCustomPivot.x, y: cand.point3D.y, z: predCustomPivot.z },
              label: `Encosto Quina Y=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
        if (Math.abs(dzCand) <= thresholdMm && (!bestContactSnapZ || Math.abs(dzCand) < bestContactSnapZ.distMm)) {
          bestContactSnapZ = {
            delta: rawDelta.z + dzCand,
            distMm: Math.abs(dzCand),
            highlight: {
              pointStart: cand.point3D,
              pointEnd: { x: predCustomPivot.x, y: predCustomPivot.y, z: cand.point3D.z },
              label: `Encosto Quina Z=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }
    }

    // -------------------------------------------------------------------------
    // 1. SNAP DE ENCOSTO E ALINHAMENTO EM X (Esquerda-Direita, Faces Externas e Centro X)
    // -------------------------------------------------------------------------
    const overlapYZ =
      predBbox.minY <= ob.maxY + 10 &&
      predBbox.maxY >= ob.minY - 10 &&
      predBbox.minZ <= ob.maxZ + 10 &&
      predBbox.maxZ >= ob.minZ - 10;

    // 1a: Face Direita da peça movida -> Face Esquerda da outra (maxX == ob.minX)
    const gapRightToLeft = ob.minX - predBbox.maxX;
    if (Math.abs(gapRightToLeft) <= thresholdMm) {
      if (overlapYZ) {
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
      } else if (!bestAlignX || Math.abs(gapRightToLeft) < bestAlignX.distMm) {
        bestAlignX = {
          delta: rawDelta.x + gapRightToLeft,
          distMm: Math.abs(gapRightToLeft),
          guide: {
            axis: "x",
            startPt: { x: ob.minX, y: predCenter.y, z: predCenter.z },
            endPt: { x: ob.minX, y: oCenter.y, z: oCenter.z },
            label: `Snap X: Encosto (${ob.minX.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 1b: Face Esquerda da peça movida -> Face Direita da outra (minX == ob.maxX)
    const gapLeftToRight = ob.maxX - predBbox.minX;
    if (Math.abs(gapLeftToRight) <= thresholdMm) {
      if (overlapYZ) {
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
      } else if (!bestAlignX || Math.abs(gapLeftToRight) < bestAlignX.distMm) {
        bestAlignX = {
          delta: rawDelta.x + gapLeftToRight,
          distMm: Math.abs(gapLeftToRight),
          guide: {
            axis: "x",
            startPt: { x: ob.maxX, y: predCenter.y, z: predCenter.z },
            endPt: { x: ob.maxX, y: oCenter.y, z: oCenter.z },
            label: `Snap X: Encosto (${ob.maxX.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 1c: Alinhamento de Centros e Faces Externas em X
    const xCandidates = [
      { diff: oCenter.x - predCenter.x, xVal: oCenter.x, label: `Snap X: Centro (${oCenter.x.toFixed(2)} mm)` },
      { diff: ob.minX - predBbox.minX, xVal: ob.minX, label: `Snap X: Face Esq (${ob.minX.toFixed(2)} mm)` },
      { diff: ob.maxX - predBbox.maxX, xVal: ob.maxX, label: `Snap X: Face Dir (${ob.maxX.toFixed(2)} mm)` },
    ];
    for (const xc of xCandidates) {
      const absD = Math.abs(xc.diff);
      if (absD <= thresholdMm && (!bestAlignX || absD < bestAlignX.distMm)) {
        bestAlignX = {
          delta: rawDelta.x + xc.diff,
          distMm: absD,
          guide: {
            axis: "x",
            startPt: { x: xc.xVal, y: predCenter.y, z: predCenter.z },
            endPt: { x: xc.xVal, y: oCenter.y, z: oCenter.z },
            label: xc.label,
          },
        };
      }
    }

    // -------------------------------------------------------------------------
    // 2. SNAP DE ENCOSTO E ALINHAMENTO EM Y (Frente-Fundo, Faces Externas e Centro Y)
    // -------------------------------------------------------------------------
    const overlapXZ =
      predBbox.minX <= ob.maxX + 10 &&
      predBbox.maxX >= ob.minX - 10 &&
      predBbox.minZ <= ob.maxZ + 10 &&
      predBbox.maxZ >= ob.minZ - 10;

    // 2a: Face Superior/Fundo Y da peça movida -> Base/Frente Y da outra (maxY == ob.minY)
    const gapTopToBottomY = ob.minY - predBbox.maxY;
    if (Math.abs(gapTopToBottomY) <= thresholdMm) {
      if (overlapXZ) {
        if (!bestContactSnapY || Math.abs(gapTopToBottomY) < bestContactSnapY.distMm) {
          bestContactSnapY = {
            delta: rawDelta.y + gapTopToBottomY,
            distMm: Math.abs(gapTopToBottomY),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: ob.minY, z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: ob.minY, z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face Y=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      } else if (!bestAlignY || Math.abs(gapTopToBottomY) < bestAlignY.distMm) {
        bestAlignY = {
          delta: rawDelta.y + gapTopToBottomY,
          distMm: Math.abs(gapTopToBottomY),
          guide: {
            axis: "y",
            startPt: { x: predCenter.x, y: ob.minY, z: predCenter.z },
            endPt: { x: oCenter.x, y: ob.minY, z: oCenter.z },
            label: `Snap Y: Encosto (${ob.minY.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 2b: Face Base/Frente Y da peça movida -> Topo/Fundo Y da outra (minY == ob.maxY)
    const gapBottomToTopY = ob.maxY - predBbox.minY;
    if (Math.abs(gapBottomToTopY) <= thresholdMm) {
      if (overlapXZ) {
        if (!bestContactSnapY || Math.abs(gapBottomToTopY) < bestContactSnapY.distMm) {
          bestContactSnapY = {
            delta: rawDelta.y + gapBottomToTopY,
            distMm: Math.abs(gapBottomToTopY),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: ob.maxY, z: (predBbox.minZ + ob.minZ) * 0.5 },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: ob.maxY, z: (predBbox.maxZ + ob.maxZ) * 0.5 },
              label: `Encosto Face Y=0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      } else if (!bestAlignY || Math.abs(gapBottomToTopY) < bestAlignY.distMm) {
        bestAlignY = {
          delta: rawDelta.y + gapBottomToTopY,
          distMm: Math.abs(gapBottomToTopY),
          guide: {
            axis: "y",
            startPt: { x: predCenter.x, y: ob.maxY, z: predCenter.z },
            endPt: { x: oCenter.x, y: ob.maxY, z: oCenter.z },
            label: `Snap Y: Encosto (${ob.maxY.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 2c: Alinhamento de Centros e Faces Externas em Y
    const yCandidates = [
      { diff: oCenter.y - predCenter.y, yVal: oCenter.y, label: `Snap Y: Centro (${oCenter.y.toFixed(2)} mm)` },
      { diff: ob.minY - predBbox.minY, yVal: ob.minY, label: `Snap Y: Face Frente (${ob.minY.toFixed(2)} mm)` },
      { diff: ob.maxY - predBbox.maxY, yVal: ob.maxY, label: `Snap Y: Face Fundo (${ob.maxY.toFixed(2)} mm)` },
    ];
    for (const yc of yCandidates) {
      const absD = Math.abs(yc.diff);
      if (absD <= thresholdMm && (!bestAlignY || absD < bestAlignY.distMm)) {
        bestAlignY = {
          delta: rawDelta.y + yc.diff,
          distMm: absD,
          guide: {
            axis: "y",
            startPt: { x: predCenter.x, y: yc.yVal, z: predCenter.z },
            endPt: { x: oCenter.x, y: yc.yVal, z: oCenter.z },
            label: yc.label,
          },
        };
      }
    }

    // -------------------------------------------------------------------------
    // 3. SNAP DE ENCOSTO E ALINHAMENTO EM Z (5 Pares Obrigatórios de Altura Z)
    //    1. Base com Topo (moving.minZ == target.maxZ) — fresta zero 0.00 mm
    //    2. Topo com Base (moving.maxZ == target.minZ) — fresta zero 0.00 mm
    //    3. Topo com Topo (moving.maxZ == target.maxZ) — nivelamento superior
    //    4. Base com Base (moving.minZ == target.minZ) — nivelamento inferior
    //    5. Centro Z com Centro Z (moving.centerZ == target.centerZ)
    // -------------------------------------------------------------------------
    const overlapXY =
      predBbox.minX <= ob.maxX + 10 &&
      predBbox.maxX >= ob.minX - 10 &&
      predBbox.minY <= ob.maxY + 10 &&
      predBbox.maxY >= ob.minY - 10;

    // 3a: Base da peça movida pousa no Topo da peça alvo (moving.minZ == target.maxZ)
    const gapBaseToTopZ = ob.maxZ - predBbox.minZ;
    if (Math.abs(gapBaseToTopZ) <= thresholdMm) {
      if (overlapXY) {
        if (!bestContactSnapZ || Math.abs(gapBaseToTopZ) < bestContactSnapZ.distMm) {
          bestContactSnapZ = {
            delta: rawDelta.z + gapBaseToTopZ,
            distMm: Math.abs(gapBaseToTopZ),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: Math.max(predBbox.minY, ob.minY), z: ob.maxZ },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: Math.min(predBbox.maxY, ob.maxY), z: ob.maxZ },
              label: `Snap Z: Topo (${ob.maxZ.toFixed(2)} mm) — 0.00 mm`,
              targetBodyName: other.name,
            },
          };
        }
      }
      if (!bestAlignZ || Math.abs(gapBaseToTopZ) < bestAlignZ.distMm) {
        bestAlignZ = {
          delta: rawDelta.z + gapBaseToTopZ,
          distMm: Math.abs(gapBaseToTopZ),
          guide: {
            axis: "z",
            startPt: { x: predCenter.x, y: predCenter.y, z: ob.maxZ },
            endPt: { x: oCenter.x, y: oCenter.y, z: ob.maxZ },
            label: `Snap Z: Topo (${ob.maxZ.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 3b: Topo da peça movida encosta na Base da peça alvo (moving.maxZ == target.minZ)
    const gapTopToBaseZ = ob.minZ - predBbox.maxZ;
    if (Math.abs(gapTopToBaseZ) <= thresholdMm) {
      if (overlapXY) {
        if (!bestContactSnapZ || Math.abs(gapTopToBaseZ) < bestContactSnapZ.distMm) {
          bestContactSnapZ = {
            delta: rawDelta.z + gapTopToBaseZ,
            distMm: Math.abs(gapTopToBaseZ),
            highlight: {
              pointStart: { x: Math.max(predBbox.minX, ob.minX), y: Math.max(predBbox.minY, ob.minY), z: ob.minZ },
              pointEnd: { x: Math.min(predBbox.maxX, ob.maxX), y: Math.min(predBbox.maxY, ob.maxY), z: ob.minZ },
              label: `Snap Z: Base (${ob.minZ.toFixed(2)} mm) — 0.00 mm`,
              targetBodyName: other.name,
            },
          };
        }
      }
      if (!bestAlignZ || Math.abs(gapTopToBaseZ) < bestAlignZ.distMm) {
        bestAlignZ = {
          delta: rawDelta.z + gapTopToBaseZ,
          distMm: Math.abs(gapTopToBaseZ),
          guide: {
            axis: "z",
            startPt: { x: predCenter.x, y: predCenter.y, z: ob.minZ },
            endPt: { x: oCenter.x, y: oCenter.y, z: ob.minZ },
            label: `Snap Z: Topo ➔ Base (${ob.minZ.toFixed(2)} mm)`,
          },
        };
      }
    }

    // 3c: Nivelamento Topo-com-Topo, Base-com-Base e Centro-Z com Centro-Z
    const zCandidates = [
      { diff: ob.maxZ - predBbox.maxZ, zVal: ob.maxZ, label: `Snap Z: Topo (${ob.maxZ.toFixed(2)} mm)` },
      { diff: ob.minZ - predBbox.minZ, zVal: ob.minZ, label: `Snap Z: Base (${ob.minZ.toFixed(2)} mm)` },
      { diff: oCenter.z - predCenter.z, zVal: oCenter.z, label: `Snap Z: Centro (${oCenter.z.toFixed(2)} mm)` },
    ];
    for (const zc of zCandidates) {
      const absD = Math.abs(zc.diff);
      if (absD <= thresholdMm && (!bestAlignZ || absD < bestAlignZ.distMm)) {
        bestAlignZ = {
          delta: rawDelta.z + zc.diff,
          distMm: absD,
          guide: {
            axis: "z",
            startPt: { x: predCenter.x, y: predCenter.y, z: zc.zVal },
            endPt: { x: oCenter.x, y: oCenter.y, z: zc.zVal },
            label: zc.label,
          },
        };
      }
    }
  }

  // Aplica snaps e guias de alinhamento em X
  if (bestContactSnapX) {
    result.snappedDelta.x = bestContactSnapX.delta;
    result.hasContactSnap = true;
    if (bestContactSnapX.highlight) {
      result.contactHighlight = bestContactSnapX.highlight;
      result.snapBadgeLabel = bestContactSnapX.highlight.label;
    }
  } else if (bestAlignX) {
    result.snappedDelta.x = bestAlignX.delta;
    result.hasAlignmentSnap = true;
    result.alignmentGuides.push(bestAlignX.guide);
    result.snapBadgeLabel = bestAlignX.guide.label;
  }

  // Aplica snaps e guias de alinhamento em Y
  if (bestContactSnapY) {
    result.snappedDelta.y = bestContactSnapY.delta;
    result.hasContactSnap = true;
    if (bestContactSnapY.highlight) {
      result.contactHighlight = bestContactSnapY.highlight;
      result.snapBadgeLabel = bestContactSnapY.highlight.label;
    }
  } else if (bestAlignY) {
    result.snappedDelta.y = bestAlignY.delta;
    result.hasAlignmentSnap = true;
    result.alignmentGuides.push(bestAlignY.guide);
    result.snapBadgeLabel = bestAlignY.guide.label;
  }

  // Aplica snaps e guias de alinhamento em Z (incluindo linha tracejada 3D de referência)
  if (bestContactSnapZ) {
    result.snappedDelta.z = bestContactSnapZ.delta;
    result.hasContactSnap = true;
    if (bestContactSnapZ.highlight) {
      result.contactHighlight = bestContactSnapZ.highlight;
      result.snapBadgeLabel = bestContactSnapZ.highlight.label;
    }
    if (bestAlignZ) {
      result.alignmentGuides.push(bestAlignZ.guide);
    }
  } else if (bestAlignZ) {
    result.snappedDelta.z = bestAlignZ.delta;
    result.hasAlignmentSnap = true;
    result.alignmentGuides.push(bestAlignZ.guide);
    result.snapBadgeLabel = bestAlignZ.guide.label;
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
): {
  snappedOffsetMm: number;
  hasSnap: boolean;
  snapTargetName?: string;
  contactHighlight?: ContactSnapResult3D["contactHighlight"];
} {
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
          const p0 = otherFace.polygon3D[0] ?? otherFace.centroid;
          const p1 = otherFace.polygon3D[Math.min(2, otherFace.polygon3D.length - 1)] ?? otherFace.centroid;
          return {
            snappedOffsetMm: Number(targetDistMm.toFixed(2)),
            hasSnap: true,
            snapTargetName: other.name,
            contactHighlight: {
              pointStart: p0,
              pointEnd: p1,
              label: `Encosto Face 0.00mm (${other.name})`,
              targetBodyName: other.name,
            },
          };
        }
      }
    }
  }

  return { snappedOffsetMm: currentOffsetMm, hasSnap: false };
}

