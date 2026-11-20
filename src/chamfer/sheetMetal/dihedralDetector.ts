/**
 * CALDRA CHAMFER — DETECTOR AUTOMÁTICO DE ÂNGULO DIEDRO PARA PEÇAS SEM "BEND TREE"
 *
 * Permite acionar `Desdobrar (Unfold)` ou `Converter em Chapa` sobre qualquer sólido 3D genérico
 * já dobrado (ex.: cantoneira em L 90° ou 60°, perfil U, chapa extrudada sem usar Edge Flange):
 *
 *  1. Agrupa triângulos da malha em faces coplanares (tolerância angular <= 1.5°).
 *  2. Identifica pares de faces paralelas opostas (n_a · n_b <= -0.999) separadas por distância
 *     constante para inferir automaticamente a espessura real `T` (com fallback para a regra ativa).
 *  3. Detecta dobras entre faces planas principais adjacentes (aresta viva ou face cilíndrica):
 *       cosVal = clamp(dot(n1, n2), -1, 1)
 *       bendAngleDeg = acos(cosVal) * 180 / PI
 *       signedCross = dot(cross(n1, n2), axisDir)  =>  direction = signedCross >= 0 ? "UP" : "DOWN"
 *     Mede raio interno real quando houver face cilíndrica intermediária; caso contrário usa regra ativa.
 *  4. Escolhe a face fixa (face selecionada ou maior face plana), constrói a `SheetMetalBody` +
 *     `BendTree` com todos os `BendNode` detectados (`state: "FOLDED"`) e retorna o resumo pronto
 *     para o chip de confirmação na Gaveta Lateral Direita.
 */

import {
  computeBendDevelopment,
  vec3Cross,
  vec3Dot,
  vec3Len,
  vec3Normalize,
  vec3Sub,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./bendMath";
import {
  DEFAULT_SHEET_METAL_RULES,
  SHEET_METAL_SCHEMA_VERSION,
  createContourFlangeBody,
  makeRectContour2D,
  type BendDirection,
  type BendNode,
  type FlangeNode,
  type SheetMetalBody,
  type SheetMetalRule,
} from "./bendTree";

export interface RawTriangleMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface DetectedPlanarFace {
  faceId: string;
  normal: Vec3Tuple;
  planeOffset: number; // dot(normal, p)
  areaMm2: number;
  centroid: Vec3Tuple;
  vertices: Vec3Tuple[];
  triangleIndices: number[];
}

export interface DetectedDihedralBend {
  bendId: string;
  faceAId: string;
  faceBId: string;
  bendAngleDeg: number;
  direction: BendDirection;
  axisOrigin: Vec3Tuple;
  axisDir: Vec3Tuple;
  bendLineLengthMm: number;
  innerRadiusMm: number;
}

export interface DihedralDetectionResult {
  ok: boolean;
  error?: string;
  body: SheetMetalBody | null;
  inferredThicknessMm: number;
  inferredInnerRadiusMm: number;
  detectedBends: DetectedDihedralBend[];
  confirmationChipText: string;
}

const COPLANAR_COS_TOL = Math.cos((1.5 * Math.PI) / 180); // <= 1.5°
const PLANE_DIST_TOL = 0.35; // mm

function getTriVerts(mesh: RawTriangleMesh, triIdx: number): [Vec3Tuple, Vec3Tuple, Vec3Tuple] {
  const i0 = mesh.indices[triIdx * 3]! * 3;
  const i1 = mesh.indices[triIdx * 3 + 1]! * 3;
  const i2 = mesh.indices[triIdx * 3 + 2]! * 3;
  return [
    [mesh.positions[i0]!, mesh.positions[i0 + 1]!, mesh.positions[i0 + 2]!],
    [mesh.positions[i1]!, mesh.positions[i1 + 1]!, mesh.positions[i1 + 2]!],
    [mesh.positions[i2]!, mesh.positions[i2 + 1]!, mesh.positions[i2 + 2]!],
  ];
}

function edgeProximity(vertsA: Vec3Tuple[], vertsB: Vec3Tuple[], tol = 1.2): Vec3Tuple[] {
  const shared: Vec3Tuple[] = [];
  for (const a of vertsA) {
    for (const b of vertsB) {
      if (vec3Len(vec3Sub(a, b)) <= tol) {
        // Evita duplicatas muito próximas
        if (!shared.some((s) => vec3Len(vec3Sub(s, a)) <= 0.25)) {
          shared.push([(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5]);
        }
      }
    }
  }
  return shared;
}

/**
 * 1) Agrupa triângulos em faces coplanares (tolerância angular <= 1.5°).
 */
export function groupCoplanarFaces(mesh: RawTriangleMesh): DetectedPlanarFace[] {
  const triCount = Math.floor(mesh.indices.length / 3);
  const faces: DetectedPlanarFace[] = [];

  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = getTriVerts(mesh, t);
    const cross = vec3Cross(vec3Sub(b, a), vec3Sub(c, a));
    const doubleArea = vec3Len(cross);
    if (doubleArea < 1e-6) continue;
    const area = doubleArea * 0.5;
    const normal: Vec3Tuple = [cross[0] / doubleArea, cross[1] / doubleArea, cross[2] / doubleArea];
    const offset = vec3Dot(normal, a);

    let matched: DetectedPlanarFace | null = null;
    for (const f of faces) {
      if (
        vec3Dot(f.normal, normal) >= COPLANAR_COS_TOL &&
        Math.abs(f.planeOffset - offset) <= PLANE_DIST_TOL
      ) {
        matched = f;
        break;
      }
    }

    if (matched) {
      const totalArea = matched.areaMm2 + area;
      matched.centroid = [
        (matched.centroid[0] * matched.areaMm2 + ((a[0] + b[0] + c[0]) / 3) * area) / totalArea,
        (matched.centroid[1] * matched.areaMm2 + ((a[1] + b[1] + c[1]) / 3) * area) / totalArea,
        (matched.centroid[2] * matched.areaMm2 + ((a[2] + b[2] + c[2]) / 3) * area) / totalArea,
      ];
      matched.areaMm2 = totalArea;
      matched.triangleIndices.push(t);
      matched.vertices.push(a, b, c);
    } else {
      faces.push({
        faceId: `planar_face_${faces.length + 1}`,
        normal,
        planeOffset: offset,
        areaMm2: area,
        centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        vertices: [a, b, c],
        triangleIndices: [t],
      });
    }
  }

  return faces.sort((x, y) => y.areaMm2 - x.areaMm2);
}

/**
 * 2) Identifica pares de faces paralelas opostas (dot(n_a, n_b) <= -0.999) separadas por
 *    distância constante para inferir a espessura real `T` e selecionar 1 face representante
 *    por chapa/aba.
 */
function inferSheetThicknessAndPrimaryFaces(
  faces: DetectedPlanarFace[],
  fallbackThicknessMm: number,
): { thicknessMm: number; primaryFaces: DetectedPlanarFace[] } {
  const candidates: Array<{
    faceA: DetectedPlanarFace;
    faceB: DetectedPlanarFace;
    dist: number;
    score: number;
  }> = [];

  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i]!;
      const b = faces[j]!;
      if (vec3Dot(a.normal, b.normal) > -0.999) continue;
      // Distância entre planos paralelos opostos: |dot(n_a, c_a - c_b)|
      const dist = Math.abs(vec3Dot(a.normal, vec3Sub(a.centroid, b.centroid)));
      if (dist < 0.25 || dist > 50) continue;
      // Verifica se as projeções estão sobrepostas (não deslocadas longe)
      const areaRatio = Math.min(a.areaMm2, b.areaMm2) / Math.max(a.areaMm2, b.areaMm2);
      if (areaRatio < 0.35) continue;
      candidates.push({
        faceA: a,
        faceB: b,
        dist,
        score: Math.min(a.areaMm2, b.areaMm2),
      });
    }
  }

  if (candidates.length === 0) {
    return {
      thicknessMm: fallbackThicknessMm,
      primaryFaces: faces.filter((f) => f.areaMm2 > 4).slice(0, 8),
    };
  }

  // Encontra a espessura dominante entre os pares de maior área
  candidates.sort((x, y) => y.score - x.score);
  const dominantT = candidates[0]!.dist;

  // Escolhe pares consistentes com a espessura dominante (±15% ou ±0.5mm)
  const matchingPairs = candidates.filter(
    (c) => Math.abs(c.dist - dominantT) <= Math.max(0.5, dominantT * 0.15),
  );

  // Seleciona 1 face representante por flange (a face de mesmo lado/maior área de cada par)
  const used = new Set<string>();
  const primaryFaces: DetectedPlanarFace[] = [];
  for (const pair of matchingPairs) {
    if (used.has(pair.faceA.faceId) || used.has(pair.faceB.faceId)) continue;
    used.add(pair.faceA.faceId);
    used.add(pair.faceB.faceId);
    primaryFaces.push(pair.faceA.areaMm2 >= pair.faceB.areaMm2 ? pair.faceA : pair.faceB);
  }

  return {
    thicknessMm: Number(dominantT.toFixed(3)),
    primaryFaces: primaryFaces.length > 0 ? primaryFaces : faces.slice(0, 6),
  };
}

/**
 * Estima largura (ao longo do eixo) e comprimento externo de uma face plana detectada.
 */
function measureFaceExtents(
  face: DetectedPlanarFace,
  axisDir: Vec3Tuple,
): { spanAlongAxisMm: number; legLengthMm: number } {
  const ax = vec3Normalize(axisDir);
  const perp = vec3Normalize(vec3Cross(face.normal, ax));
  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;
  for (const v of face.vertices) {
    const u = vec3Dot(v, ax);
    const w = vec3Dot(v, perp);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (w < minV) minV = w;
    if (w > maxV) maxV = w;
  }
  return {
    spanAlongAxisMm: Math.max(1, Number((maxU - minU).toFixed(3))),
    legLengthMm: Math.max(1, Number((maxV - minV).toFixed(3))),
  };
}

/**
 * Detector Principal de Ângulo Diedro sobre malha 3D genérica sem BendTree.
 */
export function detectDihedralBendsFromMesh(
  mesh: RawTriangleMesh,
  options?: {
    fallbackRule?: SheetMetalRule;
    selectedRootFaceId?: string;
    name?: string;
  },
): DihedralDetectionResult {
  const baseRule = options?.fallbackRule ?? DEFAULT_SHEET_METAL_RULES[4]!;
  if (!mesh || mesh.indices.length < 12) {
    return {
      ok: false,
      error: "Malha 3D insuficiente para detecção automática de dobras.",
      body: null,
      inferredThicknessMm: baseRule.thicknessMm,
      inferredInnerRadiusMm: baseRule.innerRadiusMm,
      detectedBends: [],
      confirmationChipText: "Nenhuma dobra detectada na malha.",
    };
  }

  const allFaces = groupCoplanarFaces(mesh);
  const { thicknessMm, primaryFaces } = inferSheetThicknessAndPrimaryFaces(
    allFaces,
    baseRule.thicknessMm,
  );

  const rule: SheetMetalRule = {
    ...baseRule,
    thicknessMm,
    innerRadiusMm: baseRule.innerRadiusMm,
  };

  if (primaryFaces.length < 2) {
    return {
      ok: false,
      error: "Menos de 2 faces planas principais detectadas para extrair dobras.",
      body: null,
      inferredThicknessMm: thicknessMm,
      inferredInnerRadiusMm: rule.innerRadiusMm,
      detectedBends: [],
      confirmationChipText: "Chapa plana detectada (0 dobras).",
    };
  }

  // Escolhe face raiz: selecionada pelo usuário ou maior face plana
  const rootFace =
    (options?.selectedRootFaceId &&
      primaryFaces.find((f) => f.faceId === options.selectedRootFaceId)) ||
    primaryFaces[0]!;

  // Detecta pares de faces planas adjacentes (aresta compartilhada ou proximidade <= T + 2*R)
  const detectedBends: DetectedDihedralBend[] = [];
  const adjacency = new Map<string, Array<{ other: DetectedPlanarFace; bend: DetectedDihedralBend }>>();
  const bridgeTol = Math.max(2.0, thicknessMm * 2.2 + rule.innerRadiusMm * 2.2);

  for (let i = 0; i < primaryFaces.length; i++) {
    for (let j = i + 1; j < primaryFaces.length; j++) {
      const f1 = primaryFaces[i]!;
      const f2 = primaryFaces[j]!;

      // Evita faces coplanares ou opostas (0° ou 180° paralelas não conectadas por dobra)
      const rawDot = Math.max(-1, Math.min(1, vec3Dot(f1.normal, f2.normal)));
      const angleDeg = (Math.acos(rawDot) * 180) / Math.PI;
      if (angleDeg < 3 || angleDeg > 177) continue;

      const sharedPts = edgeProximity(f1.vertices, f2.vertices, bridgeTol);
      if (sharedPts.length < 2) continue;

      // Calcula vetor unitário do eixo da dobra ao longo dos pontos compartilhados mais distantes
      let bestP1 = sharedPts[0]!;
      let bestP2 = sharedPts[1]!;
      let maxDist = 0;
      for (let a = 0; a < sharedPts.length; a++) {
        for (let b = a + 1; b < sharedPts.length; b++) {
          const d = vec3Len(vec3Sub(sharedPts[b]!, sharedPts[a]!));
          if (d > maxDist) {
            maxDist = d;
            bestP1 = sharedPts[a]!;
            bestP2 = sharedPts[b]!;
          }
        }
      }
      if (maxDist < 1) continue;

      const axisDir = vec3Normalize(vec3Sub(bestP2, bestP1));
      // Produto misto para determinar sentido UP vs DOWN
      const signedCross = vec3Dot(vec3Cross(f1.normal, f2.normal), axisDir);
      const direction: BendDirection = signedCross >= 0 ? "UP" : "DOWN";

      // Estima raio interno se houver afastamento cilíndrico entre faces (se canto vivo, usa regra ativa)
      const directShared = edgeProximity(f1.vertices, f2.vertices, 0.35);
      let inferredRadius = rule.innerRadiusMm;
      if (directShared.length < 2) {
        // Estima distância mínima entre os dois planos na região da junção
        let minGap = Infinity;
        for (const v1 of f1.vertices) {
          for (const v2 of f2.vertices) {
            const d = vec3Len(vec3Sub(v1, v2));
            if (d < minGap) minGap = d;
          }
        }
        if (Number.isFinite(minGap) && minGap > 0.4) {
          const theta = (angleDeg * Math.PI) / 180;
          const chordFactor = 2 * Math.sin(theta * 0.5);
          if (chordFactor > 0.1) {
            inferredRadius = Number(Math.max(0.5, minGap / chordFactor).toFixed(2));
          }
        }
      }

      const bendId = `bend_${String(detectedBends.length + 1).padStart(2, "0")}`;
      const det: DetectedDihedralBend = {
        bendId,
        faceAId: f1.faceId,
        faceBId: f2.faceId,
        bendAngleDeg: Number(angleDeg.toFixed(2)),
        direction,
        axisOrigin: bestP1,
        axisDir,
        bendLineLengthMm: Number(maxDist.toFixed(2)),
        innerRadiusMm: inferredRadius,
      };
      detectedBends.push(det);

      const list1 = adjacency.get(f1.faceId) ?? [];
      list1.push({ other: f2, bend: det });
      adjacency.set(f1.faceId, list1);

      const list2 = adjacency.get(f2.faceId) ?? [];
      list2.push({ other: f1, bend: det });
      adjacency.set(f2.faceId, list2);
    }
  }

  if (detectedBends.length === 0) {
    return {
      ok: false,
      error: "Nenhuma dobra adjacente foi encontrada entre as faces planas.",
      body: null,
      inferredThicknessMm: thicknessMm,
      inferredInnerRadiusMm: rule.innerRadiusMm,
      detectedBends: [],
      confirmationChipText: "0 dobras detectadas.",
    };
  }

  // Constrói a `SheetMetalBody` + `BendTree` por BFS a partir da `rootFace`
  const flanges: Record<string, FlangeNode> = {};
  const bends: Record<string, BendNode> = {};
  const visited = new Set<string>([rootFace.faceId]);
  const faceToFlangeId = new Map<string, string>([[rootFace.faceId, "flange_root"]]);
  const flangeEndX = new Map<string, number>();

  const firstBend = (adjacency.get(rootFace.faceId) ?? [])[0]?.bend ?? detectedBends[0]!;
  const rootExt = measureFaceExtents(rootFace, firstBend.axisDir);
  const firstDev = computeBendDevelopment(
    firstBend.bendAngleDeg,
    thicknessMm,
    firstBend.innerRadiusMm,
    rule.kFactor,
  );
  const rootFlatLen = Math.max(1, rootExt.legLengthMm - firstDev.outsideSetbackMm);

  flanges["flange_root"] = {
    flangeId: "flange_root",
    name: "Face Fixa (Detectada)",
    contour2D: makeRectContour2D(0, 0, rootFlatLen, rootExt.spanAlongAxisMm),
    holes2D: [],
    isFixedRoot: true,
    externalLengthMm: rootExt.legLengthMm,
    widthMm: rootExt.spanAlongAxisMm,
  };
  flangeEndX.set("flange_root", rootFlatLen);

  const queue: DetectedPlanarFace[] = [rootFace];
  let idx = 1;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currFlangeId = faceToFlangeId.get(curr.faceId)!;
    const startX = flangeEndX.get(currFlangeId) ?? 0;

    for (const link of adjacency.get(curr.faceId) ?? []) {
      if (visited.has(link.other.faceId)) continue;
      visited.add(link.other.faceId);

      const childFlangeId = `flange_${String(idx).padStart(2, "0")}`;
      const bendId = `bend_${String(idx).padStart(2, "0")}`;
      idx++;

      const childExt = measureFaceExtents(link.other, link.bend.axisDir);
      const dev = computeBendDevelopment(
        link.bend.bendAngleDeg,
        thicknessMm,
        link.bend.innerRadiusMm,
        rule.kFactor,
      );
      const childFlatLen = Math.max(1, childExt.legLengthMm - dev.outsideSetbackMm);

      flanges[childFlangeId] = {
        flangeId: childFlangeId,
        name: `Aba Detectada ${idx - 1}`,
        contour2D: makeRectContour2D(startX, 0, childFlatLen, childExt.spanAlongAxisMm),
        holes2D: [],
        isFixedRoot: false,
        externalLengthMm: childExt.legLengthMm,
        widthMm: childExt.spanAlongAxisMm,
      };
      faceToFlangeId.set(link.other.faceId, childFlangeId);
      flangeEndX.set(childFlangeId, startX + childFlatLen);

      bends[bendId] = {
        bendId,
        parentFlangeId: currFlangeId,
        childFlangeId,
        axisOriginLocal: [startX, 0, 0],
        axisDirLocal: [0, 1, 0],
        targetAngleDeg: dev.angleDeg,
        direction: link.bend.direction,
        innerRadiusMm: dev.innerRadiusMm,
        kFactor: dev.kFactor,
        bendPosition: "MATERIAL_OUTSIDE",
        state: "FOLDED",
        bendAllowanceMm: Number(dev.bendAllowanceMm.toFixed(6)),
        outsideSetbackMm: Number(dev.outsideSetbackMm.toFixed(6)),
        bendDeductionMm: Number(dev.bendDeductionMm.toFixed(6)),
        parentEdge: "right",
        bendLineLengthMm: link.bend.bendLineLengthMm,
        externalLegLengthMm: childExt.legLengthMm,
      };

      queue.push(link.other);
    }
  }

  const body: SheetMetalBody = {
    bodyId: `sm_detected_${Date.now()}`,
    schemaVersion: SHEET_METAL_SCHEMA_VERSION,
    name: options?.name ?? "Chapa Detectada (Ângulo Diedro)",
    rule,
    rootFlangeId: "flange_root",
    flanges,
    bends,
    crossBendCutouts: [],
  };

  const angleList = Object.values(bends)
    .map((b) => `${b.targetAngleDeg.toFixed(1)}°`)
    .join(", ");
  const radiusDisplay = Object.values(bends)[0]?.innerRadiusMm ?? rule.innerRadiusMm;
  const confirmationChipText = `✓ ${Object.keys(bends).length} dobra(s) detectada(s): ${angleList} • T=${thicknessMm}mm • R=${radiusDisplay}mm`;

  return {
    ok: true,
    body,
    inferredThicknessMm: thicknessMm,
    inferredInnerRadiusMm: radiusDisplay,
    detectedBends,
    confirmationChipText,
  };
}

/**
 * Helper auxiliar para criar uma malha 3D de perfil "L" ou polilinha extrudada (sólido genérico SEM BendTree)
 * e também para detectar dobras a partir de um perfil 2D desenhado em L/U/Z e extrudado no CHAMFER!
 */
export function buildExtrudedProfileMeshFromPolyline2D(
  centerline2D: Vec2Tuple[],
  thicknessMm: number,
  extrudeWidthMm: number,
): RawTriangleMesh {
  const positions: number[] = [];
  const indices: number[] = [];

  const pushBoxBetween = (a: Vec2Tuple, b: Vec2Tuple, t: number, w: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const nx = (-dy / len) * (t * 0.5);
    const ny = (dx / len) * (t * 0.5);

    const p0: Vec3Tuple = [a[0] - nx, a[1] - ny, 0];
    const p1: Vec3Tuple = [b[0] - nx, b[1] - ny, 0];
    const p2: Vec3Tuple = [b[0] + nx, b[1] + ny, 0];
    const p3: Vec3Tuple = [a[0] + nx, a[1] + ny, 0];
    const p4: Vec3Tuple = [p0[0], p0[1], w];
    const p5: Vec3Tuple = [p1[0], p1[1], w];
    const p6: Vec3Tuple = [p2[0], p2[1], w];
    const p7: Vec3Tuple = [p3[0], p3[1], w];

    const addQuad = (q0: Vec3Tuple, q1: Vec3Tuple, q2: Vec3Tuple, q3: Vec3Tuple) => {
      const base = positions.length / 3;
      positions.push(...q0, ...q1, ...q2, ...q3);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // Faces principais opostas (distância exata = thicknessMm)
    addQuad(p0, p1, p5, p4); // lado -n
    addQuad(p2, p3, p7, p6); // lado +n
    // Tampas z=0 e z=w
    addQuad(p0, p3, p2, p1);
    addQuad(p4, p5, p6, p7);
    // Extremidades
    addQuad(p3, p0, p4, p7);
    addQuad(p1, p2, p6, p5);
  };

  for (let i = 0; i < centerline2D.length - 1; i++) {
    pushBoxBetween(centerline2D[i]!, centerline2D[i + 1]!, thicknessMm, extrudeWidthMm);
  }

  return { positions, indices };
}

/**
 * Detecta automaticamente dobras em um perfil 2D em L/U/Z (sólido extrudado sem BendTree)
 * desenhado diretamente no CHAMFER 2D/3D.
 */
export function detectDihedralBendsFromPolyline2D(
  points: Vec2Tuple[],
  thicknessMm: number,
  extrudeWidthMm: number,
  fallbackRule: SheetMetalRule = DEFAULT_SHEET_METAL_RULES[4]!,
): DihedralDetectionResult {
  if (points.length < 3) {
    return {
      ok: false,
      error: "Desenhe ao menos 2 segmentos conectados (ex.: perfil em L ou U) para detectar dobras.",
      body: null,
      inferredThicknessMm: thicknessMm,
      inferredInnerRadiusMm: fallbackRule.innerRadiusMm,
      detectedBends: [],
      confirmationChipText: "Perfil sem vértices de dobra.",
    };
  }

  // Primeiro tenta via malha 3D real (pipeline completo do DihedralBendDetector)
  const mesh = buildExtrudedProfileMeshFromPolyline2D(points, thicknessMm, extrudeWidthMm);
  const meshRes = detectDihedralBendsFromMesh(mesh, {
    fallbackRule: { ...fallbackRule, thicknessMm },
    name: "Perfil Extrudado → Chapa",
  });
  if (meshRes.ok && meshRes.body) {
    return meshRes;
  }

  // Fallback analítico direto pelos vetores dos segmentos da polilinha
  const legs: number[] = [];
  const angles: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    legs.push(Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])));
  }
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const v1: Vec2Tuple = [p1[0] - p0[0], p1[1] - p0[1]];
    const v2: Vec2Tuple = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const cosVal = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)));
    const deg = (Math.acos(cosVal) * 180) / Math.PI;
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    angles.push(cross >= 0 ? deg : -deg);
  }

  const rule: SheetMetalRule = { ...fallbackRule, thicknessMm };
  const body = createContourFlangeBody({
    name: "Perfil Extrudado → Chapa",
    extrudeWidthMm,
    externalLegsMm: legs,
    bendAnglesDeg: angles,
    rule,
  });

  const detectedBends: DetectedDihedralBend[] = Object.values(body.bends).map((b) => ({
    bendId: b.bendId,
    faceAId: b.parentFlangeId,
    faceBId: b.childFlangeId,
    bendAngleDeg: b.targetAngleDeg,
    direction: b.direction,
    axisOrigin: b.axisOriginLocal,
    axisDir: b.axisDirLocal,
    bendLineLengthMm: b.bendLineLengthMm ?? extrudeWidthMm,
    innerRadiusMm: b.innerRadiusMm,
  }));

  const angleList = detectedBends.map((b) => `${b.bendAngleDeg.toFixed(1)}°`).join(", ");
  return {
    ok: detectedBends.length > 0,
    body,
    inferredThicknessMm: thicknessMm,
    inferredInnerRadiusMm: rule.innerRadiusMm,
    detectedBends,
    confirmationChipText: `✓ ${detectedBends.length} dobra(s) detectada(s): ${angleList} • T=${thicknessMm}mm • R=${rule.innerRadiusMm}mm`,
  };
}
