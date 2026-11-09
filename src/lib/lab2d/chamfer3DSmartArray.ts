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

// ============================================================================
// GERADOR DE "QUADRO EM 45° (ESQUADRIA)" NO ARRAY 3D
// Suporta Medida Interna (Vão Livre), Média (Centro a Centro) e Externa (Fora a Fora)
// + Divisões Internas Opcionais (Tubos de Grade) + Auto-Enquadramento à Esquerda
// ============================================================================

export type SmartArrayPanelTab3D = "grille" | "frame_45";
export type SmartFrameMeasureRef3D = "inner" | "mid" | "outer";
export type SmartFramePlane3D = "xy" | "xz" | "yz";
export type SmartFrameJointMode3D = "miter_45" | "butt_90";

export interface SmartMiterFrameParams3D {
  measureRef: SmartFrameMeasureRef3D;
  widthInputMm?: number;
  heightInputMm?: number;
  inputWidthMm?: number;
  inputHeightMm?: number;
  profileWidthMm?: number;
  profileCrossSectionMm?: number;
  profileDepthMm?: number;
  wallThicknessMm?: number;
  plane?: SmartFramePlane3D;
  jointMode?: SmartFrameJointMode3D;
  innerDivisionsCount?: number;
  center3D?: { x: number; y: number; z: number };
  origin3D?: { x: number; y: number; z: number };
}

export interface SmartMiterFrameMemberSpec3D {
  role: "top" | "bottom" | "left" | "right" | "inner_grille";
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  elevationZ: number;
  extrudeHeightMm: number;
  miterCutTopDeg: number;
  miterCutBottomDeg: number;
  miterAxis: "x" | "y";
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number };
  longLengthMm: number;
  shortLengthMm: number;
}

export interface SmartMiterFrameResult3D {
  measureRef: SmartFrameMeasureRef3D;
  plane: SmartFramePlane3D;
  jointMode: SmartFrameJointMode3D;
  widthInputMm: number;
  heightInputMm: number;
  profileWidthMm: number;
  profileCrossSectionMm: number;
  profileDepthMm: number;
  wallThicknessMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  midWidthMm: number;
  midHeightMm: number;
  outerWidthMm: number;
  outerHeightMm: number;
  miterAngleDeg: number;
  innerDivisionsCount: number;
  innerClearGapMm: number;
  innerPitchMm: number;
  members: SmartMiterFrameMemberSpec3D[];
  bbox3D: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  valid: boolean;
}

export function computeSmartMiterFrame3D(
  params: SmartMiterFrameParams3D,
): SmartMiterFrameResult3D {
  const rawD = params.profileWidthMm ?? params.profileCrossSectionMm ?? 40;
  const d = Math.max(5, Number(rawD) || 40);
  const depth = Math.max(5, Number(params.profileDepthMm ?? d) || d);
  const wallT = Math.max(0.8, Math.min(d * 0.4, Number(params.wallThicknessMm) || 2.0));
  const rawW = params.widthInputMm ?? params.inputWidthMm ?? 1000;
  const rawH = params.heightInputMm ?? params.inputHeightMm ?? 1000;
  const L = Math.max(d * 2.2, Number(rawW) || 1000);
  const A = Math.max(d * 2.2, Number(rawH) || 1000);
  const plane: SmartFramePlane3D = params.plane ?? "xy";
  const jointMode: SmartFrameJointMode3D = params.jointMode ?? "miter_45";
  const miterAngleDeg = jointMode === "miter_45" ? 45 : 0;

  let innerWidthMm = L;
  let innerHeightMm = A;
  let midWidthMm = L + d;
  let midHeightMm = A + d;
  let outerWidthMm = L + 2 * d;
  let outerHeightMm = A + 2 * d;

  if (params.measureRef === "inner") {
    innerWidthMm = L;
    innerHeightMm = A;
    midWidthMm = L + d;
    midHeightMm = A + d;
    outerWidthMm = L + 2 * d;
    outerHeightMm = A + 2 * d;
  } else if (params.measureRef === "mid") {
    midWidthMm = L;
    midHeightMm = A;
    outerWidthMm = L + d;
    outerHeightMm = A + d;
    innerWidthMm = Math.max(0, L - d);
    innerHeightMm = Math.max(0, A - d);
  } else {
    outerWidthMm = L;
    outerHeightMm = A;
    midWidthMm = Math.max(d, L - d);
    midHeightMm = Math.max(d, A - d);
    innerWidthMm = Math.max(0, L - 2 * d);
    innerHeightMm = Math.max(0, A - 2 * d);
  }

  const cx = params.center3D?.x ?? 0;
  const cy = params.center3D?.y ?? 0;
  const cz = params.center3D?.z ?? 0;

  const halfOutW = outerWidthMm * 0.5;
  const halfOutH = outerHeightMm * 0.5;
  const halfInW = innerWidthMm * 0.5;
  const halfInH = innerHeightMm * 0.5;

  const nDiv = Math.max(0, Math.min(60, Math.round(params.innerDivisionsCount ?? 0)));
  const grilleRes =
    nDiv > 0 && innerWidthMm > d
      ? computeSmartGrilleArray3D({
          mode: "by_count",
          spanMm: innerWidthMm,
          tubeWidthMm: d,
          count: nDiv,
          maxClearGapMm: 110,
          startInnerCoordMm: cx - halfInW,
          axis: "x",
        })
      : null;

  const innerClearGapMm = grilleRes ? grilleRes.clearGapMm : Number(innerWidthMm.toFixed(2));
  const innerPitchMm = grilleRes ? grilleRes.pitchCenterToCenterMm : 0;

  const members: SmartMiterFrameMemberSpec3D[] = [];

  if (plane === "xz") {
    // Quadro Frontal em Pé (Largura no eixo X, Altura no eixo Z)
    const y0 = cy - depth * 0.5;
    const y1 = cy + depth * 0.5;
    const zBot = Math.max(0, cz);
    const zTop = zBot + outerHeightMm;

    // Montante Esquerdo (vertical em Z)
    members.push({
      role: "left",
      label: `Montante Esquerdo (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx - halfInW,
      minY: y0,
      maxY: y1,
      elevationZ: zBot,
      extrudeHeightMm: outerHeightMm,
      miterCutTopDeg: miterAngleDeg,
      miterCutBottomDeg: miterAngleDeg,
      miterAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerHeightMm.toFixed(2)),
      shortLengthMm: Number(innerHeightMm.toFixed(2)),
    });

    // Montante Direito (vertical em Z)
    members.push({
      role: "right",
      label: `Montante Direito (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx + halfInW,
      maxX: cx + halfOutW,
      minY: y0,
      maxY: y1,
      elevationZ: zBot,
      extrudeHeightMm: outerHeightMm,
      miterCutTopDeg: -miterAngleDeg,
      miterCutBottomDeg: -miterAngleDeg,
      miterAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerHeightMm.toFixed(2)),
      shortLengthMm: Number(innerHeightMm.toFixed(2)),
    });

    // Travessa Inferior (horizontal em X)
    members.push({
      role: "bottom",
      label: `Travessa Inferior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx + halfOutW,
      minY: y0,
      maxY: y1,
      elevationZ: zBot,
      extrudeHeightMm: d,
      miterCutTopDeg: miterAngleDeg,
      miterCutBottomDeg: -miterAngleDeg,
      miterAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerWidthMm.toFixed(2)),
      shortLengthMm: Number(innerWidthMm.toFixed(2)),
    });

    // Travessa Superior (horizontal em X)
    members.push({
      role: "top",
      label: `Travessa Superior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx + halfOutW,
      minY: y0,
      maxY: y1,
      elevationZ: zTop - d,
      extrudeHeightMm: d,
      miterCutTopDeg: -miterAngleDeg,
      miterCutBottomDeg: miterAngleDeg,
      miterAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerWidthMm.toFixed(2)),
      shortLengthMm: Number(innerWidthMm.toFixed(2)),
    });

    if (grilleRes && grilleRes.valid) {
      grilleRes.centerCoordsMm.forEach((xCenter, idx) => {
        members.push({
          role: "inner_grille",
          label: `Tubo Interno #${idx + 1} (${innerHeightMm.toFixed(0)} mm)`,
          minX: xCenter - d * 0.5,
          maxX: xCenter + d * 0.5,
          minY: y0,
          maxY: y1,
          elevationZ: zBot + d,
          extrudeHeightMm: Math.max(10, innerHeightMm),
          miterCutTopDeg: 0,
          miterCutBottomDeg: 0,
          miterAxis: "x",
          rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
          longLengthMm: Number(innerHeightMm.toFixed(2)),
          shortLengthMm: Number(innerHeightMm.toFixed(2)),
        });
      });
    }
  } else {
    // Quadro no Plano XY (Deitado na Mesa) ou YZ
    const zBase = Math.max(0, cz);
    // Travessa Superior (+Y)
    members.push({
      role: "top",
      label: `Travessa Superior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx + halfOutW,
      minY: cy + halfInH,
      maxY: cy + halfOutH,
      elevationZ: zBase,
      extrudeHeightMm: depth,
      miterCutTopDeg: miterAngleDeg,
      miterCutBottomDeg: -miterAngleDeg,
      miterAxis: "x",
      rotation3D: plane === "yz" ? { rxDeg: 0, ryDeg: 90, rzDeg: 0 } : { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerWidthMm.toFixed(2)),
      shortLengthMm: Number(innerWidthMm.toFixed(2)),
    });

    // Travessa Inferior (-Y)
    members.push({
      role: "bottom",
      label: `Travessa Inferior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx + halfOutW,
      minY: cy - halfOutH,
      maxY: cy - halfInH,
      elevationZ: zBase,
      extrudeHeightMm: depth,
      miterCutTopDeg: -miterAngleDeg,
      miterCutBottomDeg: miterAngleDeg,
      miterAxis: "x",
      rotation3D: plane === "yz" ? { rxDeg: 0, ryDeg: 90, rzDeg: 0 } : { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerWidthMm.toFixed(2)),
      shortLengthMm: Number(innerWidthMm.toFixed(2)),
    });

    // Montante Esquerdo (-X)
    members.push({
      role: "left",
      label: `Montante Esquerdo (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx - halfOutW,
      maxX: cx - halfInW,
      minY: cy - halfOutH,
      maxY: cy + halfOutH,
      elevationZ: zBase,
      extrudeHeightMm: depth,
      miterCutTopDeg: miterAngleDeg,
      miterCutBottomDeg: -miterAngleDeg,
      miterAxis: "y",
      rotation3D: plane === "yz" ? { rxDeg: 0, ryDeg: 90, rzDeg: 0 } : { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerHeightMm.toFixed(2)),
      shortLengthMm: Number(innerHeightMm.toFixed(2)),
    });

    // Montante Direito (+X)
    members.push({
      role: "right",
      label: `Montante Direito (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      minX: cx + halfInW,
      maxX: cx + halfOutW,
      minY: cy - halfOutH,
      maxY: cy + halfOutH,
      elevationZ: zBase,
      extrudeHeightMm: depth,
      miterCutTopDeg: -miterAngleDeg,
      miterCutBottomDeg: miterAngleDeg,
      miterAxis: "y",
      rotation3D: plane === "yz" ? { rxDeg: 0, ryDeg: 90, rzDeg: 0 } : { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(outerHeightMm.toFixed(2)),
      shortLengthMm: Number(innerHeightMm.toFixed(2)),
    });

    if (grilleRes && grilleRes.valid) {
      grilleRes.centerCoordsMm.forEach((xCenter, idx) => {
        members.push({
          role: "inner_grille",
          label: `Tubo Interno #${idx + 1} (${innerHeightMm.toFixed(0)} mm)`,
          minX: xCenter - d * 0.5,
          maxX: xCenter + d * 0.5,
          minY: cy - halfInH,
          maxY: cy + halfInH,
          elevationZ: zBase,
          extrudeHeightMm: depth,
          miterCutTopDeg: 0,
          miterCutBottomDeg: 0,
          miterAxis: "y",
          rotation3D: plane === "yz" ? { rxDeg: 0, ryDeg: 90, rzDeg: 0 } : { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
          longLengthMm: Number(innerHeightMm.toFixed(2)),
          shortLengthMm: Number(innerHeightMm.toFixed(2)),
        });
      });
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const m of members) {
    if (m.minX < minX) minX = m.minX;
    if (m.maxX > maxX) maxX = m.maxX;
    if (m.minY < minY) minY = m.minY;
    if (m.maxY > maxY) maxY = m.maxY;
    if (m.elevationZ < minZ) minZ = m.elevationZ;
    if (m.elevationZ + m.extrudeHeightMm > maxZ) maxZ = m.elevationZ + m.extrudeHeightMm;
  }

  return {
    measureRef: params.measureRef,
    plane,
    jointMode,
    widthInputMm: Number(L.toFixed(2)),
    heightInputMm: Number(A.toFixed(2)),
    profileWidthMm: Number(d.toFixed(2)),
    profileCrossSectionMm: Number(d.toFixed(2)),
    profileDepthMm: Number(depth.toFixed(2)),
    wallThicknessMm: Number(wallT.toFixed(2)),
    innerWidthMm: Number(innerWidthMm.toFixed(2)),
    innerHeightMm: Number(innerHeightMm.toFixed(2)),
    midWidthMm: Number(midWidthMm.toFixed(2)),
    midHeightMm: Number(midHeightMm.toFixed(2)),
    outerWidthMm: Number(outerWidthMm.toFixed(2)),
    outerHeightMm: Number(outerHeightMm.toFixed(2)),
    miterAngleDeg,
    innerDivisionsCount: nDiv,
    innerClearGapMm: Number(innerClearGapMm.toFixed(2)),
    innerPitchMm: Number(innerPitchMm.toFixed(2)),
    members,
    bbox3D: {
      minX: Number.isFinite(minX) ? minX : -halfOutW,
      maxX: Number.isFinite(maxX) ? maxX : halfOutW,
      minY: Number.isFinite(minY) ? minY : -halfOutH,
      maxY: Number.isFinite(maxY) ? maxY : halfOutH,
      minZ: Number.isFinite(minZ) ? minZ : 0,
      maxZ: Number.isFinite(maxZ) ? maxZ : depth,
    },
    valid: innerWidthMm >= 10 && innerHeightMm >= 10 && (nDiv === 0 || Boolean(grilleRes?.valid)),
  };
}

/**
 * Gera os corpos 3D das 4 barras do Quadro em 45° (Esquadria) + N divisões internas opcionais.
 */
export function generateSmartMiterFrameEntities3D(
  entities: Entity[],
  sourceEntityId: string | null,
  sourceBodyOrFrameResult: DirectBody3D | SmartMiterFrameResult3D | null,
  maybeFrameResult?: SmartMiterFrameResult3D,
): { updatedEntities: Entity[]; createdIds: string[] } {
  const is3ArgCall =
    maybeFrameResult === undefined &&
    sourceBodyOrFrameResult !== null &&
    "members" in sourceBodyOrFrameResult;
  const sourceBody: DirectBody3D | null = is3ArgCall
    ? null
    : (sourceBodyOrFrameResult as DirectBody3D | null);
  const frameResult: SmartMiterFrameResult3D = is3ArgCall
    ? (sourceBodyOrFrameResult as SmartMiterFrameResult3D)
    : maybeFrameResult!;

  const createdEntities: Entity[] = [];
  const createdIds: string[] = [];

  const srcEnt = sourceEntityId ? entities.find((e) => e.id === sourceEntityId) : null;
  const wallT =
    sourceBody?.shellWallThicknessMm ||
    sourceBody?.shellThicknessMm ||
    srcEnt?.shellWallThickness ||
    frameResult.wallThicknessMm ||
    2.0;
  const colorHex = sourceBody?.colorHex || "#94A3B8";
  const materialName = sourceBody?.materialName || "Aço Estrutural ASTM A36";

  for (const m of frameResult.members) {
    const newId = uid();
    const pts = [
      { x: Number(m.minX.toFixed(2)), y: Number(m.minY.toFixed(2)) },
      { x: Number(m.maxX.toFixed(2)), y: Number(m.minY.toFixed(2)) },
      { x: Number(m.maxX.toFixed(2)), y: Number(m.maxY.toFixed(2)) },
      { x: Number(m.minX.toFixed(2)), y: Number(m.maxY.toFixed(2)) },
    ];
    const ent: Entity = {
      id: newId,
      layer: "corte",
      type: "polyline",
      pts,
      closed: true,
      elevationZ: Number(m.elevationZ.toFixed(2)),
      extrudeHeight: Number(m.extrudeHeightMm.toFixed(2)),
      shellWallThickness: wallT,
      params: {
        isIndependentBody3D: true,
        booleanMode3D: "new_body",
        elevationZ: Number(m.elevationZ.toFixed(2)),
        extrudeHeight: Number(m.extrudeHeightMm.toFixed(2)),
        extrudeHeightMm: Number(m.extrudeHeightMm.toFixed(2)),
        shellWallThickness: wallT,
        shellThicknessMm: wallT,
        shellOpenCaps: ["top", "bottom"],
        miterCutTopDeg: m.miterCutTopDeg,
        miterCutTopAxis: m.miterAxis,
        miterCutBottomDeg: m.miterCutBottomDeg,
        miterCutBottomAxis: m.miterAxis,
        rotation3D: m.rotation3D,
        bodyName: m.label,
        bodyColorHex: colorHex,
        bodyMaterial: materialName,
        frameMemberRole: m.role,
        frameLongLengthMm: m.longLengthMm,
        frameShortLengthMm: m.shortLengthMm,
      },
    };
    createdEntities.push(ent);
    createdIds.push(newId);
  }

  // Remove o perfil de origem se era apenas o tubo semente isolado para substituir pelo quadro completo
  const baseEntities =
    sourceEntityId && entities.length === 1 && entities[0]?.id === sourceEntityId
      ? []
      : entities;

  return {
    updatedEntities: [...baseEntities, ...createdEntities],
    createdIds,
  };
}

