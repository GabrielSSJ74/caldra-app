import { translate, uid, type Entity } from "./core";
import type { DirectBody3D, DirectFace3D } from "./cadDirectModeling3D";

export type SmartArrayAxis3D = "x" | "y" | "z";
export type SmartArrayDivisionMode3D = "by_count" | "by_max_gap";

export interface SmartSpanDetection3D {
  axis: SmartArrayAxis3D;
  spanMm: number;
  startInnerCoordMm: number;
  endInnerCoordMm: number;
  tubeWidthMm: number;
  startBodyId: string | null;
  endBodyId: string | null;
  isAutoDetected: boolean;
}

export interface SmartGrilleArrayParams3D {
  mode: SmartArrayDivisionMode3D;
  spanMm: number;
  tubeWidthMm: number;
  count: number;
  maxClearGapMm: number;
  startInnerCoordMm: number;
  axis: SmartArrayAxis3D;
}

export interface SmartGrilleArrayResult3D {
  axis: SmartArrayAxis3D;
  mode: SmartArrayDivisionMode3D;
  spanMm: number;
  tubeWidthMm: number;
  count: number;
  clearGapMm: number;
  pitchCenterToCenterMm: number;
  startInnerCoordMm: number;
  endInnerCoordMm: number;
  centerCoordsMm: number[];
  valid: boolean;
}

export function getBodyIntervalAlongAxis(
  body: DirectBody3D,
  axis: SmartArrayAxis3D,
): { min: number; max: number; size: number; center: number } {
  if (axis === "x") {
    const min = body.bbox3D.minX;
    const max = body.bbox3D.maxX;
    return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
  }
  if (axis === "y") {
    const min = body.bbox3D.minY;
    const max = body.bbox3D.maxY;
    return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
  }
  const min = body.bbox3D.minZ;
  const max = body.bbox3D.maxZ;
  return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
}

/**
 * Analisa os corpos vizinhos na cena ao longo do eixo escolhido (X, Y ou Z)
 * e detecta automaticamente o Vão Livre Interno (V_vão em mm) entre a face interna
 * da primeira coluna/travessa e a face interna da coluna/travessa oposta.
 */
export function detectInternalSpan3D(
  selectedBody: DirectBody3D | null,
  allBodies: readonly DirectBody3D[],
  axis: SmartArrayAxis3D,
  clickedFaces?: readonly DirectFace3D[],
): SmartSpanDetection3D {
  const refBody = selectedBody ?? allBodies[0] ?? null;
  const refInterval = refBody
    ? getBodyIntervalAlongAxis(refBody, axis)
    : { min: 0, max: 30, size: 30, center: 15 };
  const tubeWidthMm = Math.max(2, Number(refInterval.size.toFixed(2)));

  // 1. Se o usuário clicou em duas faces para medir o vão na hora:
  if (clickedFaces && clickedFaces.length >= 2) {
    const f1 = clickedFaces[0]!;
    const f2 = clickedFaces[1]!;
    const c1 = f1.centroid[axis];
    const c2 = f2.centroid[axis];
    const startInnerCoordMm = Math.min(c1, c2);
    const endInnerCoordMm = Math.max(c1, c2);
    const spanMm = Math.max(10, Number((endInnerCoordMm - startInnerCoordMm).toFixed(2)));
    return {
      axis,
      spanMm,
      startInnerCoordMm: Number(startInnerCoordMm.toFixed(2)),
      endInnerCoordMm: Number(endInnerCoordMm.toFixed(2)),
      tubeWidthMm,
      startBodyId: f1.entityId,
      endBodyId: f2.entityId,
      isAutoDetected: true,
    };
  }

  // 2. Se houver 2 ou mais corpos na cena, procura o par de colunas/travessas de borda
  if (allBodies.length >= 2 && refBody) {
    const sorted = [...allBodies]
      .map((b) => ({ body: b, interval: getBodyIntervalAlongAxis(b, axis) }))
      .sort((a, b) => a.interval.center - b.interval.center);

    // Caso 2A: O corpo selecionado é uma coluna lateral — procura a coluna oposta mais próxima com vão livre > 15mm
    let bestPair: {
      left: (typeof sorted)[number];
      right: (typeof sorted)[number];
      gap: number;
    } | null = null;

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const left = sorted[i]!;
        const right = sorted[j]!;
        const gap = right.interval.min - left.interval.max;
        if (gap <= 15) continue;

        const involvesSelected =
          left.body.entityId === refBody.entityId || right.body.entityId === refBody.entityId;
        const selectedInsideGap =
          refInterval.center >= left.interval.max - 1 &&
          refInterval.center <= right.interval.min + 1;

        if (involvesSelected || selectedInsideGap) {
          // Prioriza o maior vão estrutural delimitado pelas colunas principais
          if (!bestPair || gap > bestPair.gap) {
            bestPair = { left, right, gap };
          }
        }
      }
    }

    // Fallback se nenhum par envolveu diretamente o selecionado: pega o maior vão entre extremos
    if (!bestPair) {
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const gap = last.interval.min - first.interval.max;
      if (gap > 15) {
        bestPair = { left: first, right: last, gap };
      }
    }

    if (bestPair) {
      const startInnerCoordMm = Number(bestPair.left.interval.max.toFixed(2));
      const endInnerCoordMm = Number(bestPair.right.interval.min.toFixed(2));
      const spanMm = Number(Math.max(10, endInnerCoordMm - startInnerCoordMm).toFixed(2));
      return {
        axis,
        spanMm,
        startInnerCoordMm,
        endInnerCoordMm,
        tubeWidthMm,
        startBodyId: bestPair.left.body.entityId,
        endBodyId: bestPair.right.body.entityId,
        isAutoDetected: true,
      };
    }
  }

  // 3. Fallback padrão quando há apenas 1 peça isolada na cena (ex.: 1000 mm de vão livre a partir da face interna)
  const defaultSpanMm = 1000;
  const startInnerCoordMm = Number(refInterval.max.toFixed(2));
  return {
    axis,
    spanMm: defaultSpanMm,
    startInnerCoordMm,
    endInnerCoordMm: Number((startInnerCoordMm + defaultSpanMm).toFixed(2)),
    tubeWidthMm,
    startBodyId: refBody?.entityId ?? null,
    endBodyId: null,
    isAutoDetected: false,
  };
}

/**
 * Calcula a distribuição exata de tubos/perfis para Grades e Portões (Serralheria):
 *
 * - Modo A (`by_count`): Dividir Vão por Quantidade (N Tubos internos)
 *   v_livre = (V_vão - N * d_tubo) / (N + 1)
 *   P = d_tubo + v_livre
 *
 * - Modo B (`by_max_gap`): Por Passo ou Vão Máximo (mm)
 *   Calcula automaticamente o número ideal de tubos N para que o vão livre entre tubos
 *   nunca ultrapasse `maxClearGapMm` (ex.: 110 mm) e equaliza todas as distâncias.
 */
export function computeSmartGrilleArray3D(
  params: SmartGrilleArrayParams3D,
): SmartGrilleArrayResult3D {
  const spanMm = Math.max(10, Number(params.spanMm) || 1000);
  const tubeWidthMm = Math.max(1, Number(params.tubeWidthMm) || 30);
  const startInnerCoordMm = Number(params.startInnerCoordMm) || 0;

  let count = Math.max(1, Math.min(80, Math.round(params.count || 1)));
  if (params.mode === "by_max_gap") {
    const maxGap = Math.max(5, Number(params.maxClearGapMm) || 110);
    // Para que v_livre <= maxGap: (V_vao - N * d_tubo) / (N + 1) <= maxGap
    // => V_vao - maxGap <= N * (d_tubo + maxGap)
    const idealCount = Math.ceil((spanMm - maxGap) / (tubeWidthMm + maxGap));
    count = Math.max(1, Math.min(80, idealCount));
  }

  const clearGapMm = (spanMm - count * tubeWidthMm) / (count + 1);
  const pitchCenterToCenterMm = tubeWidthMm + clearGapMm;
  const endInnerCoordMm = startInnerCoordMm + spanMm;

  const centerCoordsMm: number[] = [];
  for (let i = 0; i < count; i++) {
    const centerCoord =
      startInnerCoordMm + clearGapMm + tubeWidthMm * 0.5 + i * pitchCenterToCenterMm;
    centerCoordsMm.push(Number(centerCoord.toFixed(3)));
  }

  return {
    axis: params.axis,
    mode: params.mode,
    spanMm: Number(spanMm.toFixed(2)),
    tubeWidthMm: Number(tubeWidthMm.toFixed(2)),
    count,
    clearGapMm: Number(clearGapMm.toFixed(2)),
    pitchCenterToCenterMm: Number(pitchCenterToCenterMm.toFixed(2)),
    startInnerCoordMm: Number(startInnerCoordMm.toFixed(2)),
    endInnerCoordMm: Number(endInnerCoordMm.toFixed(2)),
    centerCoordsMm,
    valid: clearGapMm > 0,
  };
}

/**
 * Gera as entidades 3D reais para os N tubos internos do Array/Grade em uma única operação atômica.
 */
export function generateSmartGrilleArrayEntities3D(
  entities: Entity[],
  sourceEntityId: string,
  sourceBody: DirectBody3D,
  arrayResult: SmartGrilleArrayResult3D,
): { updatedEntities: Entity[]; createdIds: string[] } {
  const sourceEntity = entities.find((e) => e.id === sourceEntityId);
  if (!sourceEntity || arrayResult.centerCoordsMm.length === 0) {
    return { updatedEntities: entities, createdIds: [] };
  }

  const sourceInterval = getBodyIntervalAlongAxis(sourceBody, arrayResult.axis);
  const sourceCenter = sourceInterval.center;

  const createdEntities: Entity[] = [];
  const createdIds: string[] = [];

  for (let i = 0; i < arrayResult.centerCoordsMm.length; i++) {
    const targetCenter = arrayResult.centerCoordsMm[i]!;
    const delta = targetCenter - sourceCenter;

    // Evita duplicar exatamente em cima do tubo de origem caso ele já esteja posicionado naquela coordenada
    if (Math.abs(delta) < 0.25) {
      continue;
    }

    const newId = uid();
    const translate2D = (ent: Entity, dx: number, dy: number): Entity => {
      if ((ent as { type: string }).type === "rect") {
        const r = ent as Entity & { x: number; y: number };
        return { ...structuredClone(r), x: Number((r.x + dx).toFixed(3)), y: Number((r.y + dy).toFixed(3)) };
      }
      return translate(structuredClone(ent), dx, dy) ?? structuredClone(ent);
    };

    if (arrayResult.axis === "x") {
      const cloned = translate2D(sourceEntity, delta, 0);
      cloned.id = newId;
      createdEntities.push(cloned);
      createdIds.push(newId);
    } else if (arrayResult.axis === "y") {
      const cloned = translate2D(sourceEntity, 0, delta);
      cloned.id = newId;
      createdEntities.push(cloned);
      createdIds.push(newId);
    } else {
      const cloned = structuredClone(sourceEntity);
      cloned.id = newId;
      const curZ = typeof cloned.elevationZ === "number" ? cloned.elevationZ : 0;
      cloned.elevationZ = Number((curZ + delta).toFixed(3));
      createdEntities.push(cloned);
      createdIds.push(newId);
    }
  }

  return {
    updatedEntities: [...entities, ...createdEntities],
    createdIds,
  };
}
