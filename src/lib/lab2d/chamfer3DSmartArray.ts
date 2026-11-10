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
  isHollowTube?: boolean;
  cornerFilletRadiusMm?: number;
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
  // Vetores explícitos livres de torção para barra tubular em meia-esquadria 45°
  cornerOrigin3D: { x: number; y: number; z: number };
  dirLen3D: { x: number; y: number; z: number };
  dirIn3D: { x: number; y: number; z: number };
  dirZ3D: { x: number; y: number; z: number };
  profileWidthMm: number;
  profileHeightZMm: number;
  wallThicknessMm: number;
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
  startMiterRatio: number;
  endMiterRatio: number;
  trapezoidPts2D: { x: number; y: number }[];
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
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
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

/**
 * Extrai a seção transversal real (W x H_z), espessura de parede e raio de canto
 * do tubo/perfil selecionado, ignorando rotações parasitas para montagem de quadro.
 */
export function extractTubeCrossSectionFromBody3D(
  body: DirectBody3D | null | undefined,
  maxFrameRefDimMm?: number,
): {
  profileWidthMm: number;
  profileDepthMm: number;
  wallThicknessMm: number;
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
} {
  if (!body) {
    return {
      profileWidthMm: 20,
      profileDepthMm: 20,
      wallThicknessMm: 2.0,
      isHollowTube: true,
      cornerFilletRadiusMm: 1.5,
    };
  }
  const dx = Math.max(4, Math.abs(body.bbox3D.maxX - body.bbox3D.minX));
  const dy = Math.max(4, Math.abs(body.bbox3D.maxY - body.bbox3D.minY));
  const dz = Math.max(4, Math.abs(body.bbox3D.maxZ - body.bbox3D.minZ));
  const sorted = [dx, dy, dz].sort((a, b) => a - b);
  let w = sorted[0];
  let hz = sorted[1];

  // Se a peça base era um bloco largo cujas dimensões excedem 35% do quadro desejado,
  // adapta proporcionalmente a bitola para manter um quadro tubular válido (ex.: 20x20mm ou 40x40mm)
  if (maxFrameRefDimMm && maxFrameRefDimMm > 20 && w > maxFrameRefDimMm * 0.35) {
    const adapted = Math.max(10, Math.min(50, Math.round(maxFrameRefDimMm * 0.1)));
    w = adapted;
    hz = adapted;
  }

  const rawShellT = Number(body.shellThicknessMm ?? body.shellWallThicknessMm ?? 0);
  const isHollowTube = rawShellT > 0.2;
  const wallThicknessMm = isHollowTube
    ? Math.max(0.8, Math.min(Math.min(w, hz) * 0.4, rawShellT))
    : Math.max(1.2, Math.min(Math.min(w, hz) * 0.25, 2.0));
  const cornerFilletRadiusMm = Math.max(
    0,
    Math.min(Math.min(w, hz) * 0.35, Number(body.edgeFilletRadiusMm ?? 0)),
  );

  return {
    profileWidthMm: Number(w.toFixed(2)),
    profileDepthMm: Number(hz.toFixed(2)),
    wallThicknessMm: Number(wallThicknessMm.toFixed(2)),
    isHollowTube,
    cornerFilletRadiusMm: Number(cornerFilletRadiusMm.toFixed(2)),
  };
}

function evalMiterBarPoint3D(
  origin: { x: number; y: number; z: number },
  dirLen: { x: number; y: number; z: number },
  dirIn: { x: number; y: number; z: number },
  dirZ: { x: number; y: number; z: number },
  sAlongLen: number,
  uAcrossIn: number,
  zHeight: number,
): { x: number; y: number; z: number } {
  return {
    x: origin.x + sAlongLen * dirLen.x + uAcrossIn * dirIn.x + zHeight * dirZ.x,
    y: origin.y + sAlongLen * dirLen.y + uAcrossIn * dirIn.y + zHeight * dirZ.y,
    z: origin.z + sAlongLen * dirLen.z + uAcrossIn * dirIn.z + zHeight * dirZ.z,
  };
}

export function computeSmartMiterFrame3D(
  params: SmartMiterFrameParams3D,
): SmartMiterFrameResult3D {
  const rawW = Math.max(20, Number(params.widthInputMm ?? params.inputWidthMm ?? 1000) || 1000);
  const rawH = Math.max(20, Number(params.heightInputMm ?? params.inputHeightMm ?? 1000) || 1000);
  const minInputDim = Math.min(rawW, rawH);

  const rawD = params.profileWidthMm ?? params.profileCrossSectionMm ?? 20;
  let d = Math.max(5, Number(rawD) || 20);
  let depth = Math.max(5, Number(params.profileDepthMm ?? d) || d);

  // Garante que em modo Externa ou Média a bitola W nunca engula o vão livre (L - 2*W >= 4mm)
  if (params.measureRef === "outer" && d * 2 >= minInputDim - 4) {
    d = Math.max(5, Math.min(40, Math.floor((minInputDim * 0.2) * 10) / 10));
    depth = Math.min(depth, d);
  } else if (params.measureRef === "mid" && d >= minInputDim - 4) {
    d = Math.max(5, Math.min(40, Math.floor((minInputDim * 0.2) * 10) / 10));
    depth = Math.min(depth, d);
  }

  const L = rawW;
  const A = rawH;
  const wallT = Math.max(0.8, Math.min(Math.min(d, depth) * 0.4, Number(params.wallThicknessMm) || 2.0));
  const isHollowTube = params.isHollowTube ?? true;
  const cornerFilletRadiusMm = Math.max(
    0,
    Math.min(Math.min(d, depth) * 0.35, Number(params.cornerFilletRadiusMm ?? 0)),
  );
  const plane: SmartFramePlane3D = params.plane ?? "xy";
  const jointMode: SmartFrameJointMode3D = params.jointMode ?? "miter_45";
  const miterAngleDeg = jointMode === "miter_45" ? 45 : 0;
  const miterRatio = jointMode === "miter_45" ? 1 : 0;

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
    innerWidthMm = Math.max(2, L - d);
    innerHeightMm = Math.max(2, A - d);
  } else {
    outerWidthMm = L;
    outerHeightMm = A;
    midWidthMm = Math.max(d, L - d);
    midHeightMm = Math.max(d, A - d);
    innerWidthMm = Math.max(2, L - 2 * d);
    innerHeightMm = Math.max(2, A - 2 * d);
  }

  const cx = params.center3D?.x ?? 0;
  const cy = params.center3D?.y ?? 0;
  const cz = params.center3D?.z ?? 0;

  const halfOutW = outerWidthMm * 0.5;
  const halfOutH = outerHeightMm * 0.5;
  const halfInW = innerWidthMm * 0.5;

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

  // Sistema de eixos do plano do quadro (U = Largura L_ext, V = Altura A_ext, N = Espessura H_z)
  let frameOrigin3D = { x: cx - halfOutW, y: cy - halfOutH, z: Math.max(0, cz) };
  let axisU = { x: 1, y: 0, z: 0 };
  let axisV = { x: 0, y: 1, z: 0 };
  let axisN = { x: 0, y: 0, z: 1 };

  if (plane === "xz") {
    frameOrigin3D = { x: cx - halfOutW, y: cy - depth * 0.5, z: Math.max(0, cz) };
    axisU = { x: 1, y: 0, z: 0 };
    axisV = { x: 0, y: 0, z: 1 };
    axisN = { x: 0, y: 1, z: 0 };
  } else if (plane === "yz") {
    frameOrigin3D = { x: cx - depth * 0.5, y: cy - halfOutW, z: Math.max(0, cz) };
    axisU = { x: 0, y: 1, z: 0 };
    axisV = { x: 0, y: 0, z: 1 };
    axisN = { x: 1, y: 0, z: 0 };
  }

  const makeBarSpec = (
    role: "bottom" | "right" | "top" | "left" | "inner_grille",
    label: string,
    cornerOrigin3D: { x: number; y: number; z: number },
    dirLen3D: { x: number; y: number; z: number },
    dirIn3D: { x: number; y: number; z: number },
    longLengthMm: number,
    shortLengthMm: number,
    startMiter: number,
    endMiter: number,
    miterAxis: "x" | "y",
  ): SmartMiterFrameMemberSpec3D => {
    const p00 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, 0, 0, 0);
    const p10 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm, 0, 0);
    const p11 = evalMiterBarPoint3D(
      cornerOrigin3D,
      dirLen3D,
      dirIn3D,
      axisN,
      longLengthMm - endMiter * d,
      d,
      0,
    );
    const p01 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, startMiter * d, d, 0);
    const topCorners = [
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, 0, 0, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm, 0, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm - endMiter * d, d, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, startMiter * d, d, depth),
    ];
    const allPts = [p00, p10, p11, p01, ...topCorners];
    let bMinX = Infinity;
    let bMaxX = -Infinity;
    let bMinY = Infinity;
    let bMaxY = -Infinity;
    let bMinZ = Infinity;
    let bMaxZ = -Infinity;
    for (const p of allPts) {
      if (p.x < bMinX) bMinX = p.x;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.y > bMaxY) bMaxY = p.y;
      if (p.z < bMinZ) bMinZ = p.z;
      if (p.z > bMaxZ) bMaxZ = p.z;
    }

    return {
      role,
      label,
      minX: Number(bMinX.toFixed(3)),
      maxX: Number(bMaxX.toFixed(3)),
      minY: Number(bMinY.toFixed(3)),
      maxY: Number(bMaxY.toFixed(3)),
      elevationZ: Number(bMinZ.toFixed(3)),
      extrudeHeightMm: Number(Math.max(1, bMaxZ - bMinZ).toFixed(3)),
      miterCutTopDeg: startMiter > 0 ? miterAngleDeg : 0,
      miterCutBottomDeg: endMiter > 0 ? -miterAngleDeg : 0,
      miterAxis,
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(longLengthMm.toFixed(2)),
      shortLengthMm: Number(shortLengthMm.toFixed(2)),
      cornerOrigin3D,
      dirLen3D,
      dirIn3D,
      dirZ3D: axisN,
      profileWidthMm: Number(d.toFixed(2)),
      profileHeightZMm: Number(depth.toFixed(2)),
      wallThicknessMm: Number(wallT.toFixed(2)),
      isHollowTube,
      cornerFilletRadiusMm,
      startMiterRatio: startMiter,
      endMiterRatio: endMiter,
      trapezoidPts2D: [
        { x: Number(p00.x.toFixed(2)), y: Number(p00.y.toFixed(2)) },
        { x: Number(p10.x.toFixed(2)), y: Number(p10.y.toFixed(2)) },
        { x: Number(p11.x.toFixed(2)), y: Number(p11.y.toFixed(2)) },
        { x: Number(p01.x.toFixed(2)), y: Number(p01.y.toFixed(2)) },
      ],
    };
  };

  // As 4 barras do Quadro 45° percorrendo o perímetro em sentido anti-horário sem nenhuma torção:
  // 1. Barra Frontal / Inferior (Comp = L_ext): Origem (0, 0), dir_len = +U, dir_in = +V
  const originBottom = { ...frameOrigin3D };
  // 2. Barra Direita (Comp = A_ext): Origem (L_ext, 0), dir_len = +V, dir_in = -U
  const originRight = {
    x: frameOrigin3D.x + outerWidthMm * axisU.x,
    y: frameOrigin3D.y + outerWidthMm * axisU.y,
    z: frameOrigin3D.z + outerWidthMm * axisU.z,
  };
  // 3. Barra Traseira / Superior (Comp = L_ext): Origem (L_ext, A_ext), dir_len = -U, dir_in = -V
  const originTop = {
    x: frameOrigin3D.x + outerWidthMm * axisU.x + outerHeightMm * axisV.x,
    y: frameOrigin3D.y + outerWidthMm * axisU.y + outerHeightMm * axisV.y,
    z: frameOrigin3D.z + outerWidthMm * axisU.z + outerHeightMm * axisV.z,
  };
  // 4. Barra Esquerda (Comp = A_ext): Origem (0, A_ext), dir_len = -V, dir_in = +U
  const originLeft = {
    x: frameOrigin3D.x + outerHeightMm * axisV.x,
    y: frameOrigin3D.y + outerHeightMm * axisV.y,
    z: frameOrigin3D.z + outerHeightMm * axisV.z,
  };

  const members: SmartMiterFrameMemberSpec3D[] = [
    makeBarSpec(
      "bottom",
      `Barra Frontal/Inferior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originBottom,
      axisU,
      axisV,
      outerWidthMm,
      innerWidthMm,
      miterRatio,
      miterRatio,
      "x",
    ),
    makeBarSpec(
      "right",
      `Barra Direita (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originRight,
      axisV,
      { x: -axisU.x, y: -axisU.y, z: -axisU.z },
      outerHeightMm,
      innerHeightMm,
      miterRatio,
      miterRatio,
      "y",
    ),
    makeBarSpec(
      "top",
      `Barra Traseira/Superior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originTop,
      { x: -axisU.x, y: -axisU.y, z: -axisU.z },
      { x: -axisV.x, y: -axisV.y, z: -axisV.z },
      outerWidthMm,
      innerWidthMm,
      miterRatio,
      miterRatio,
      "x",
    ),
    makeBarSpec(
      "left",
      `Barra Esquerda (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originLeft,
      { x: -axisV.x, y: -axisV.y, z: -axisV.z },
      axisU,
      outerHeightMm,
      innerHeightMm,
      miterRatio,
      miterRatio,
      "y",
    ),
  ];

  if (grilleRes && grilleRes.valid) {
    grilleRes.centerCoordsMm.forEach((xCenter, idx) => {
      const offsetAlongU = xCenter - (cx - halfOutW) - d * 0.5;
      const grilleOrigin = {
        x: frameOrigin3D.x + offsetAlongU * axisU.x + d * axisV.x,
        y: frameOrigin3D.y + offsetAlongU * axisU.y + d * axisV.y,
        z: frameOrigin3D.z + offsetAlongU * axisU.z + d * axisV.z,
      };
      members.push(
        makeBarSpec(
          "inner_grille",
          `Tubo Interno #${idx + 1} (${innerHeightMm.toFixed(0)} mm)`,
          grilleOrigin,
          axisV,
          axisU,
          Math.max(10, innerHeightMm),
          Math.max(10, innerHeightMm),
          0,
          0,
          "y",
        ),
      );
    });
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
    isHollowTube,
    cornerFilletRadiusMm,
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
    valid: innerWidthMm >= 2 && innerHeightMm >= 2 && (nDiv === 0 || Boolean(grilleRes?.valid)),
  };
}

/**
 * Gera os loops 2D (externo e interno se vazado) da seção transversal (u, z) em [0..W] x [0..H_z]
 * e projeta sem torção nos planos de meia-esquadria 45° inicial e final:
 * P_inicio(u, z) = Origem + (startMiterRatio * u) * dir_len + u * dir_in + z * dir_z
 * P_fim(u, z)    = Origem + (Comp - endMiterRatio * u) * dir_len + u * dir_in + z * dir_z
 */
export function buildHorizontalMiterBar3DPolygons(member: {
  cornerOrigin3D: { x: number; y: number; z: number };
  dirLen3D: { x: number; y: number; z: number };
  dirIn3D: { x: number; y: number; z: number };
  dirZ3D: { x: number; y: number; z: number };
  longLengthMm: number;
  profileWidthMm: number;
  profileHeightZMm: number;
  wallThicknessMm?: number;
  isHollowTube?: boolean;
  startMiterRatio?: number;
  endMiterRatio?: number;
}): {
  outerStartLoop3D: { x: number; y: number; z: number }[];
  outerEndLoop3D: { x: number; y: number; z: number }[];
  innerStartLoop3D: { x: number; y: number; z: number }[] | null;
  innerEndLoop3D: { x: number; y: number; z: number }[] | null;
  quads3D: {
    id: string;
    kind: "top" | "bottom" | "outer_side" | "inner_side" | "inner_wall" | "miter_cap";
    vertices3D: { x: number; y: number; z: number }[];
    normal3D: { x: number; y: number; z: number };
  }[];
  featureLines3D: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ][];
} {
  const W = Math.max(4, member.profileWidthMm);
  const Hz = Math.max(4, member.profileHeightZMm);
  const Comp = Math.max(W * 1.05, member.longLengthMm);
  const sRatio = member.startMiterRatio ?? 1;
  const eRatio = member.endMiterRatio ?? 1;
  const rawT = Number(member.wallThicknessMm ?? 0);
  const isHollow = (member.isHollowTube ?? rawT > 0.2) && rawT > 0.2 && rawT < Math.min(W, Hz) * 0.46;
  const t = isHollow ? rawT : 0;

  // Seção transversal retangular (u, z):
  // 0: (0, 0) [Inferior Externo]
  // 1: (W, 0) [Inferior Interno]
  // 2: (W, Hz) [Superior Interno]
  // 3: (0, Hz) [Superior Externo]
  const outerProfileUZ = [
    { u: 0, z: 0 },
    { u: W, z: 0 },
    { u: W, z: Hz },
    { u: 0, z: Hz },
  ];

  const evalStart = (u: number, z: number) =>
    evalMiterBarPoint3D(
      member.cornerOrigin3D,
      member.dirLen3D,
      member.dirIn3D,
      member.dirZ3D,
      sRatio * u,
      u,
      z,
    );
  const evalEnd = (u: number, z: number) =>
    evalMiterBarPoint3D(
      member.cornerOrigin3D,
      member.dirLen3D,
      member.dirIn3D,
      member.dirZ3D,
      Comp - eRatio * u,
      u,
      z,
    );

  const outerStartLoop3D = outerProfileUZ.map((p) => evalStart(p.u, p.z));
  const outerEndLoop3D = outerProfileUZ.map((p) => evalEnd(p.u, p.z));

  const innerProfileUZ = isHollow
    ? [
        { u: t, z: t },
        { u: W - t, z: t },
        { u: W - t, z: Hz - t },
        { u: t, z: Hz - t },
      ]
    : null;

  const innerStartLoop3D = innerProfileUZ
    ? innerProfileUZ.map((p) => evalStart(p.u, p.z))
    : null;
  const innerEndLoop3D = innerProfileUZ
    ? innerProfileUZ.map((p) => evalEnd(p.u, p.z))
    : null;

  const computeNormal = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  };

  const quads3D: {
    id: string;
    kind: "top" | "bottom" | "outer_side" | "inner_side" | "inner_wall" | "miter_cap";
    vertices3D: { x: number; y: number; z: number }[];
    normal3D: { x: number; y: number; z: number };
  }[] = [];

  // 4 faces longitudinais externas conectando diretamente o índice i -> i+1 de P_inicio a P_fim:
  // i=0 (0->1): face inferior (z=0)
  // i=1 (1->2): face lateral interna (u=W)
  // i=2 (2->3): face superior (z=Hz)
  // i=3 (3->0): face lateral externa (u=0)
  const sideKinds: ("bottom" | "inner_side" | "top" | "outer_side")[] = [
    "bottom",
    "inner_side",
    "top",
    "outer_side",
  ];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    const v0 = outerStartLoop3D[i];
    const v1 = outerEndLoop3D[i];
    const v2 = outerEndLoop3D[next];
    const v3 = outerStartLoop3D[next];
    quads3D.push({
      id: `outer-${i}`,
      kind: sideKinds[i],
      vertices3D: [v0, v1, v2, v3],
      normal3D: computeNormal(v0, v1, v2),
    });
  }

  // Se o tubo é vazado, adiciona as 4 paredes longitudinais internas + anéis de topo nas 2 bocas em 45°
  if (innerStartLoop3D && innerEndLoop3D) {
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const v0 = innerStartLoop3D[next];
      const v1 = innerEndLoop3D[next];
      const v2 = innerEndLoop3D[i];
      const v3 = innerStartLoop3D[i];
      quads3D.push({
        id: `inner-${i}`,
        kind: "inner_wall",
        vertices3D: [v0, v1, v2, v3],
        normal3D: computeNormal(v0, v1, v2),
      });
      // Anel de fechamento da parede na boca inicial (45°)
      const s0 = outerStartLoop3D[i];
      const s1 = outerStartLoop3D[next];
      const s2 = innerStartLoop3D[next];
      const s3 = innerStartLoop3D[i];
      quads3D.push({
        id: `cap-start-${i}`,
        kind: "miter_cap",
        vertices3D: [s0, s3, s2, s1],
        normal3D: computeNormal(s0, s3, s2),
      });
      // Anel de fechamento da parede na boca final (45°)
      const e0 = outerEndLoop3D[i];
      const e1 = outerEndLoop3D[next];
      const e2 = innerEndLoop3D[next];
      const e3 = innerEndLoop3D[i];
      quads3D.push({
        id: `cap-end-${i}`,
        kind: "miter_cap",
        vertices3D: [e0, e1, e2, e3],
        normal3D: computeNormal(e0, e1, e2),
      });
    }
  } else {
    // Barra maciça: tampas completas nas duas extremidades 45°
    quads3D.push({
      id: "cap-start-solid",
      kind: "miter_cap",
      vertices3D: [
        outerStartLoop3D[0],
        outerStartLoop3D[3],
        outerStartLoop3D[2],
        outerStartLoop3D[1],
      ],
      normal3D: computeNormal(outerStartLoop3D[0], outerStartLoop3D[3], outerStartLoop3D[2]),
    });
    quads3D.push({
      id: "cap-end-solid",
      kind: "miter_cap",
      vertices3D: [
        outerEndLoop3D[0],
        outerEndLoop3D[1],
        outerEndLoop3D[2],
        outerEndLoop3D[3],
      ],
      normal3D: computeNormal(outerEndLoop3D[0], outerEndLoop3D[1], outerEndLoop3D[2]),
    });
  }

  // Arestas vivas (incluindo as linhas diagonais de corte 45° nos cantos!)
  const featureLines3D: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ][] = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    // Aresta longitudinal externa i
    featureLines3D.push([outerStartLoop3D[i], outerEndLoop3D[i]]);
    // Aresta do corte 45° inicial (incluindo a diagonal na face superior e inferior!)
    featureLines3D.push([outerStartLoop3D[i], outerStartLoop3D[next]]);
    // Aresta do corte 45° final
    featureLines3D.push([outerEndLoop3D[i], outerEndLoop3D[next]]);
  }

  return {
    outerStartLoop3D,
    outerEndLoop3D,
    innerStartLoop3D,
    innerEndLoop3D,
    quads3D,
    featureLines3D,
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
  const isHollowTube =
    sourceBody !== null
      ? (sourceBody.shellThicknessMm ?? sourceBody.shellWallThicknessMm ?? 0) > 0.2 || frameResult.isHollowTube
      : frameResult.isHollowTube;
  const colorHex = sourceBody?.colorHex || "#94A3B8";
  const materialName = sourceBody?.materialName || "Aço Estrutural ASTM A36";

  for (const m of frameResult.members) {
    const newId = uid();
    const pts =
      m.trapezoidPts2D && m.trapezoidPts2D.length >= 4
        ? m.trapezoidPts2D
        : [
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
      shellWallThickness: isHollowTube ? wallT : 0,
      params: {
        isIndependentBody3D: true,
        booleanMode3D: "new_body",
        isHorizontalMiterBar3D: true,
        miterBarSpec3D: {
          cornerOrigin3D: m.cornerOrigin3D,
          dirLen3D: m.dirLen3D,
          dirIn3D: m.dirIn3D,
          dirZ3D: m.dirZ3D,
          longLengthMm: m.longLengthMm,
          shortLengthMm: m.shortLengthMm,
          profileWidthMm: m.profileWidthMm,
          profileHeightZMm: m.profileHeightZMm,
          wallThicknessMm: isHollowTube ? wallT : 0,
          isHollowTube,
          cornerFilletRadiusMm: m.cornerFilletRadiusMm,
          startMiterRatio: m.startMiterRatio,
          endMiterRatio: m.endMiterRatio,
        },
        elevationZ: Number(m.elevationZ.toFixed(2)),
        extrudeHeight: Number(m.extrudeHeightMm.toFixed(2)),
        extrudeHeightMm: Number(m.extrudeHeightMm.toFixed(2)),
        shellWallThickness: isHollowTube ? wallT : 0,
        shellThicknessMm: isHollowTube ? wallT : 0,
        shellOpenCaps: ["top", "bottom"],
        miterCutTopDeg: m.miterCutTopDeg,
        miterCutTopAxis: m.miterAxis,
        miterCutBottomDeg: m.miterCutBottomDeg,
        miterCutBottomAxis: m.miterAxis,
        rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
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

  // Substitui a peça base selecionada pelas 4 barras reais do quadro em meia-esquadria 45°
  const baseEntities = sourceEntityId
    ? entities.filter((e) => e.id !== sourceEntityId)
    : entities;

  return {
    updatedEntities: [...baseEntities, ...createdEntities],
    createdIds,
  };
}


