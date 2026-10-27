/**
 * CALDRA / CHAMFER CAD — MOTOR GEOMÉTRICO PURO DE ARRAYS (MATRIZES)
 *
 * Suporte a:
 * - Padrão Linear / Retangular (Array 1D/2D)
 * - Padrão Circular / Polar (Array Polar em Flange / PCD)
 *
 * Características:
 * - Fórmulas analíticas fechadas (sem drift de rotações acumuladas)
 * - Tolerância explícita de coincidência (1e-6 mm)
 * - Leitura e inferência inteligente da peça hospedeira (flange concêntrico, chapa)
 * - Validação física de colisões e margens de segurança para fabricação
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import { uid, dist, rotate, translate, boxOf } from "@/lib/lab2d/core";

export const EPSILON = 1e-6;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export type ArrayType = "linear" | "polar";

export type HostType = "flange" | "circular_plate" | "sheet" | "unknown";

export interface CandidateCenter {
  point: Vec2;
  label: string;
  source: "concentric_flange" | "circle_center" | "bounding_centroid" | "origin_ref";
  confidence: "high" | "medium" | "low";
}

export interface HostDetectionResult {
  type: HostType;
  confidence: "high" | "medium" | "low";
  description: string;
  center?: Vec2;
  rInner?: number;
  rOuter?: number;
  radius?: number;
  pcd?: number;
  suggestedType: ArrayType;
  sheetBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  candidateCenters: CandidateCenter[];
}

export interface PolarArrayParams {
  center: Vec2;
  count: number;
  totalAngleDeg: number; // ex: 360° para círculo completo
  startAngleDeg: number; // ângulo do furo original em relação ao centro (+X = 0°)
  clockwise?: boolean; // padrão: false (anti-horário padrão CAD)
  rotateItems?: boolean; // padrão: true
  includeOriginal?: boolean; // padrão: true (a contagem inclui a peça original)
  radius?: number; // distância ao centro (PCD / 2)
}

export interface LinearArrayParams {
  rows: number; // repetições ao longo do eixo Y / secundário
  cols: number; // repetições ao longo do eixo X / primário
  dx: number; // espaçamento no eixo X (passo ou extensão)
  dy: number; // espaçamento no eixo Y
  angleDeg?: number; // orientação angular do padrão (padrão: 0°)
  includeOriginal?: boolean; // padrão: true
}

export interface ArraySpec {
  id: string;
  type: ArrayType;
  sourceEntityIds: string[];
  polar?: PolarArrayParams;
  linear?: LinearArrayParams;
}

export interface ArrayGuides {
  type: ArrayType;
  // Polar guides
  center?: Vec2;
  pcdCircle?: { cx: number; cy: number; r: number };
  radialLines?: { x1: number; y1: number; x2: number; y2: number }[];
  // Linear guides
  gridBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  axes?: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface ArrayValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  minClearanceMm?: number;
}

// -------------------------------------------------------------
// UTILITÁRIOS GEOMÉTRICOS AUXILIARES
// -------------------------------------------------------------

export function getEntityCenter(e: Entity): Vec2 {
  switch (e.type) {
    case "circle":
    case "arc":
      return { x: e.cx, y: e.cy };
    case "point":
      return { x: e.x, y: e.y };
    case "line":
      return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
    case "polyline": {
      if (e.pts.length === 0) return { x: 0, y: 0 };
      const b = boxOf(e);
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    case "ellipse":
      return { x: e.cx, y: e.cy };
    default: {
      const b = boxOf(e);
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
  }
}

export function getGroupCenter(entities: Entity[]): Vec2 {
  if (entities.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const e of entities) {
    const b = boxOf(e);
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

// -------------------------------------------------------------
// 1. LEITURA INTELIGENTE DA PEÇA HOSPEDEIRA
// -------------------------------------------------------------

/**
 * Analisa as entidades do projeto e identifica se a seleção está contida
 * em um flange concêntrico (duas circunferências/arcos concêntricos),
 * em um contorno circular simples ou em uma chapa fechada.
 */
export function detectHostPart(
  allEntities: Entity[],
  sourceEntities: Entity[],
  projectOrigin: Vec2 = { x: 0, y: 0 },
): HostDetectionResult {
  const candidateCenters: CandidateCenter[] = [];

  if (sourceEntities.length === 0) {
    return {
      type: "unknown",
      confidence: "low",
      description: "Nenhuma entidade selecionada para análise.",
      suggestedType: "polar",
      candidateCenters: [],
    };
  }

  const sourceCenter = getGroupCenter(sourceEntities);
  const sourceIds = new Set(sourceEntities.map((e) => e.id));

  // Coleta todas as circunferências e arcos do desenho que NÃO fazem parte da seleção
  const otherCircles = allEntities.filter(
    (e) => (e.type === "circle" || e.type === "arc") && !sourceIds.has(e.id),
  ) as ((Entity & { type: "circle" }) | (Entity & { type: "arc" }))[];

  // 1. Procura por pares concêntricos (Flange clássico: furo central + borda externa)
  const concentricPairs: {
    cInner: Entity & { type: "circle" | "arc" };
    cOuter: Entity & { type: "circle" | "arc" };
    center: Vec2;
    rInner: number;
    rOuter: number;
  }[] = [];

  for (let i = 0; i < otherCircles.length; i++) {
    for (let j = i + 1; j < otherCircles.length; j++) {
      const c1 = otherCircles[i]!;
      const c2 = otherCircles[j]!;
      const d = dist({ x: c1.cx, y: c1.cy }, { x: c2.cx, y: c2.cy });
      // Se compartilham o mesmo centro dentro de 0.5 mm
      if (d <= 0.5) {
        const r1 = c1.r;
        const r2 = c2.r;
        if (Math.abs(r1 - r2) > 2) {
          const rInner = Math.min(r1, r2);
          const rOuter = Math.max(r1, r2);
          const cInner = r1 < r2 ? c1 : c2;
          const cOuter = r1 < r2 ? c2 : c1;
          concentricPairs.push({
            cInner,
            cOuter,
            center: { x: (c1.cx + c2.cx) / 2, y: (c1.cy + c2.cy) / 2 },
            rInner,
            rOuter,
          });
        }
      }
    }
  }

  // Verifica se o centro da seleção está dentro da coroa circular de algum par concêntrico
  for (const pair of concentricPairs) {
    const dToCenter = dist(pair.center, sourceCenter);
    // Se o furo estiver confortavelmente entre o furo central e o diâmetro externo
    if (dToCenter >= pair.rInner - EPSILON && dToCenter <= pair.rOuter + EPSILON) {
      candidateCenters.push({
        point: pair.center,
        label: `Centro do Flange (Øext ${(pair.rOuter * 2).toFixed(1)} / Øint ${(pair.rInner * 2).toFixed(1)} mm)`,
        source: "concentric_flange",
        confidence: "high",
      });

      return {
        type: "flange",
        confidence: "high",
        description: `Flange detectado (Øext ${(pair.rOuter * 2).toFixed(1)} mm, Øint ${(pair.rInner * 2).toFixed(1)} mm)`,
        center: pair.center,
        rInner: pair.rInner,
        rOuter: pair.rOuter,
        radius: pair.rOuter,
        pcd: dToCenter * 2,
        suggestedType: "polar",
        candidateCenters,
      };
    }
  }

  // 2. Procura por círculo maior que contenha a seleção (disco circular sem furo central)
  const enclosingCircles = otherCircles
    .filter((c) => {
      const d = dist({ x: c.cx, y: c.cy }, sourceCenter);
      return d < c.r && c.r > 15; // maior que um furo comum
    })
    .sort((a, b) => b.r - a.r);

  if (enclosingCircles.length > 0) {
    const mainCircle = enclosingCircles[0]!;
    const dToCenter = dist({ x: mainCircle.cx, y: mainCircle.cy }, sourceCenter);
    candidateCenters.push({
      point: { x: mainCircle.cx, y: mainCircle.cy },
      label: `Centro do Disco (Ø ${(mainCircle.r * 2).toFixed(1)} mm)`,
      source: "circle_center",
      confidence: "medium",
    });

    return {
      type: "circular_plate",
      confidence: "medium",
      description: `Disco circular detectado (Ø ${(mainCircle.r * 2).toFixed(1)} mm)`,
      center: { x: mainCircle.cx, y: mainCircle.cy },
      radius: mainCircle.r,
      pcd: dToCenter * 2,
      suggestedType: "polar",
      candidateCenters,
    };
  }

  // 3. Procura por contorno de chapa retangular ou polilinha fechada que contenha a seleção
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let foundOuterBoundary = false;

  for (const e of allEntities) {
    if (sourceIds.has(e.id)) continue;
    if (e.layer === "construcao" || e.layer === "referencia" || e.layer === "cota") continue;
    const b = boxOf(e);
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
    foundOuterBoundary = true;
  }

  if (foundOuterBoundary && Number.isFinite(minX) && minX < maxX) {
    const width = maxX - minX;
    const height = maxY - minY;

    candidateCenters.push({
      point: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      label: `Centroide da Chapa (${width.toFixed(1)} × ${height.toFixed(1)} mm)`,
      source: "bounding_centroid",
      confidence: "medium",
    });

    candidateCenters.push({
      point: projectOrigin,
      label: "Origem do Projeto (REF 0,0)",
      source: "origin_ref",
      confidence: "low",
    });

    return {
      type: "sheet",
      confidence: "medium",
      description: `Chapa metálica (${width.toFixed(1)} × ${height.toFixed(1)} mm)`,
      suggestedType: "linear",
      sheetBounds: { minX, minY, maxX, maxY, width, height },
      candidateCenters,
    };
  }

  // 4. Sem detecção conclusiva
  candidateCenters.push({
    point: projectOrigin,
    label: "Origem do Projeto (REF 0,0)",
    source: "origin_ref",
    confidence: "low",
  });

  return {
    type: "unknown",
    confidence: "low",
    description: "Nenhum contorno hospedeiro evidente detectado.",
    suggestedType: "linear",
    candidateCenters,
  };
}

// -------------------------------------------------------------
// 2. CÁLCULO DE INSTÂNCIAS (NÚCLEO ANALÍTICO FECHADO)
// -------------------------------------------------------------

/**
 * Calcula todas as instâncias resultantes da matriz especificada.
 * Utiliza fórmulas analíticas fechadas para evitar acúmulo de erro numérico
 * ou drift de matrizes de rotação encadeadas.
 */
export function computeInstances(
  spec: ArraySpec,
  sourceEntities: Entity[],
): { instances: Entity[]; guides: ArrayGuides } {
  if (sourceEntities.length === 0) {
    return { instances: [], guides: { type: spec.type } };
  }

  const specId = spec.id || uid();

  if (spec.type === "polar") {
    const params = spec.polar;
    if (!params) {
      return { instances: [], guides: { type: "polar" } };
    }

    const count = Math.max(1, Math.round(params.count));
    const totalAngleDeg = params.totalAngleDeg ?? 360;
    const isFullCircle = Math.abs(Math.abs(totalAngleDeg) - 360) < 1e-4;
    const stepDeg = isFullCircle ? totalAngleDeg / count : count > 1 ? totalAngleDeg / (count - 1) : 0;
    const dir = params.clockwise ? -1 : 1;
    const rotateItems = params.rotateItems ?? true;
    const includeOriginal = params.includeOriginal ?? true;
    const center = params.center;
    const sourceCenter = getGroupCenter(sourceEntities);
    const radius = params.radius ?? dist(center, sourceCenter);

    const instances: Entity[] = [];
    const radialLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    // Ângulo inicial analítico da posição original em relação ao centro do padrão
    const initialAngleRad = Math.atan2(sourceCenter.y - center.y, sourceCenter.x - center.x);
    const initialAngleDeg = initialAngleRad * RAD_TO_DEG;

    for (let i = 0; i < count; i++) {
      // Se includeOriginal for verdadeiro, o índice 0 é a própria peça original
      if (i === 0 && includeOriginal) {
        // Adiciona linha guia do raio para o furo original
        radialLines.push({
          x1: center.x,
          y1: center.y,
          x2: sourceCenter.x,
          y2: sourceCenter.y,
        });
        continue;
      }

      const currentAngleDeltaDeg = i * stepDeg * dir;
      const angleRad = currentAngleDeltaDeg * DEG_TO_RAD;
      const currentAbsoluteAngleRad = initialAngleRad + angleRad;

      // Posição calculada por fórmula fechada
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);

      const targetCenterX = center.x + radius * Math.cos(currentAbsoluteAngleRad);
      const targetCenterY = center.y + radius * Math.sin(currentAbsoluteAngleRad);

      radialLines.push({
        x1: center.x,
        y1: center.y,
        x2: targetCenterX,
        y2: targetCenterY,
      });

      sourceEntities.forEach((orig) => {
        let transformed: Entity;

        if (rotateItems) {
          // Rotaciona a entidade completa em torno do centro do padrão
          transformed = rotate(orig, center, currentAngleDeltaDeg);
        } else {
          // Apenas translada a entidade mantendo sua orientação original
          const origCenter = getEntityCenter(orig);
          const newCenterX = center.x + (origCenter.x - center.x) * cosA - (origCenter.y - center.y) * sinA;
          const newCenterY = center.y + (origCenter.x - center.x) * sinA + (origCenter.y - center.y) * cosA;
          const dx = newCenterX - origCenter.x;
          const dy = newCenterY - origCenter.y;
          transformed = translate(orig, dx, dy);
        }

        instances.push({
          ...transformed,
          id: uid(),
          params: {
            ...transformed.params,
            arrayPatternId: specId,
            arrayType: "polar",
            arrayIndex: i,
            isArrayInstance: true,
          },
        });
      });
    }

    const guides: ArrayGuides = {
      type: "polar",
      center,
      pcdCircle: {
        cx: center.x,
        cy: center.y,
        r: radius,
      },
      radialLines,
    };

    return { instances, guides };
  }

  // Padrão Linear / Retangular
  const params = spec.linear;
  if (!params) {
    return { instances: [], guides: { type: "linear" } };
  }

  const rows = Math.max(1, Math.round(params.rows));
  const cols = Math.max(1, Math.round(params.cols));
  const dx = params.dx;
  const dy = params.dy;
  const angleDeg = params.angleDeg ?? 0;
  const angleRad = angleDeg * DEG_TO_RAD;
  const cosAng = Math.cos(angleRad);
  const sinAng = Math.sin(angleRad);
  const includeOriginal = params.includeOriginal ?? true;

  const instances: Entity[] = [];
  const axes: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const baseCenter = getGroupCenter(sourceEntities);

  // Eixos guias X e Y orientados pelo ângulo da matriz
  const totalSpanX = (cols - 1) * dx;
  const totalSpanY = (rows - 1) * dy;

  axes.push({
    x1: baseCenter.x,
    y1: baseCenter.y,
    x2: baseCenter.x + totalSpanX * cosAng,
    y2: baseCenter.y + totalSpanX * sinAng,
  });

  if (rows > 1) {
    axes.push({
      x1: baseCenter.x,
      y1: baseCenter.y,
      x2: baseCenter.x - totalSpanY * sinAng,
      y2: baseCenter.y + totalSpanY * cosAng,
    });
  }

  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0 && includeOriginal) {
        index++;
        continue;
      }

      // Deslocamento orientado no plano 2D
      const rawX = c * dx;
      const rawY = r * dy;
      const shiftX = rawX * cosAng - rawY * sinAng;
      const shiftY = rawX * sinAng + rawY * cosAng;

      sourceEntities.forEach((orig) => {
        const transformed = translate(orig, shiftX, shiftY);
        instances.push({
          ...transformed,
          id: uid(),
          params: {
            ...transformed.params,
            arrayPatternId: specId,
            arrayType: "linear",
            arrayRow: r,
            arrayCol: c,
            arrayIndex: index,
            isArrayInstance: true,
          },
        });
      });

      index++;
    }
  }

  const guides: ArrayGuides = {
    type: "linear",
    axes,
  };

  return { instances, guides };
}

// -------------------------------------------------------------
// 3. VALIDAÇÃO FÍSICA E MECÂNICA DO ARRAY
// -------------------------------------------------------------

/**
 * Valida a integridade física do padrão:
 * - Evita furos sobrepostos
 * - Alerta sobre furos que invadem o furo central do flange
 * - Alerta sobre furos muito próximos à borda da peça (margem mínima de caldeiraria)
 */
export function validateArray(
  spec: ArraySpec,
  sourceEntities: Entity[],
  host?: HostDetectionResult,
): ArrayValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sourceEntities.length === 0) {
    errors.push("Nenhuma geometria selecionada para multiplicação.");
    return { isValid: false, errors, warnings };
  }

  // Raio representativo de furos circulares (para checagem de margem)
  const circleEnts = sourceEntities.filter((e) => e.type === "circle") as (Entity & {
    type: "circle";
  })[];
  const holeRadius = circleEnts.length > 0 ? circleEnts[0]!.r : 0;
  const holeDia = holeRadius * 2;

  if (spec.type === "polar") {
    const p = spec.polar;
    if (!p) {
      errors.push("Parâmetros do padrão circular não informados.");
      return { isValid: false, errors, warnings };
    }

    if (p.count < 1) {
      errors.push("Quantidade de itens deve ser no mínimo 1.");
      return { isValid: false, errors, warnings };
    }

    const { instances } = computeInstances(spec, sourceEntities);
    const allInstances = [...sourceEntities, ...instances];

    // Validação com base no hospedeiro flange
    if (host && host.type === "flange" && host.rInner !== undefined && host.rOuter !== undefined) {
      const minMargin = Math.max(2, holeRadius * 1.5); // Margem mínima de segurança (1.5x raio)

      for (const ent of allInstances) {
        const entCenter = getEntityCenter(ent);
        const d = dist(p.center, entCenter);

        // Checa se o furo corta o furo central do flange
        if (d - holeRadius < host.rInner + EPSILON) {
          errors.push(
            `Furo invade o furo central do flange (distância ao centro: ${d.toFixed(1)} mm, limite interno: ${host.rInner.toFixed(1)} mm).`,
          );
          break;
        }

        // Checa se o furo ultrapassa a borda externa do flange
        if (d + holeRadius > host.rOuter - EPSILON) {
          errors.push(
            `Furo ultrapassa o diâmetro externo do flange (distância: ${(d + holeRadius).toFixed(1)} mm, limite externo: ${host.rOuter.toFixed(1)} mm).`,
          );
          break;
        }

        // Aviso de borda muito estreita
        if (d + holeRadius > host.rOuter - minMargin) {
          warnings.push(
            `Margem externa de segurança estreita (< ${minMargin.toFixed(1)} mm da borda).`,
          );
          break;
        }
      }
    }

    // Checagem de sobreposição mútua entre instâncias adjacentes
    if (allInstances.length >= 2 && holeRadius > 0) {
      const pcd = p.radius ? p.radius * 2 : host?.pcd ?? 0;
      if (pcd > 0 && p.count > 1) {
        const perimeter = Math.PI * pcd;
        const arcPitch = perimeter / p.count;
        if (arcPitch < holeDia) {
          errors.push(
            `Passo entre furos (${arcPitch.toFixed(1)} mm) é menor que o diâmetro (Ø ${holeDia.toFixed(1)} mm): furos se sobrepõem!`,
          );
        } else if (arcPitch < holeDia * 1.25) {
          warnings.push(
            `Distância entre furos muito pequena (${(arcPitch - holeDia).toFixed(1)} mm entre bordas).`,
          );
        }
      }
    }
  } else {
    // Validação Linear
    const l = spec.linear;
    if (!l) {
      errors.push("Parâmetros do padrão linear não informados.");
      return { isValid: false, errors, warnings };
    }

    if (l.rows < 1 || l.cols < 1) {
      errors.push("Quantidade de linhas e colunas deve ser maior ou igual a 1.");
      return { isValid: false, errors, warnings };
    }

    if (l.cols > 1 && Math.abs(l.dx) < EPSILON) {
      errors.push("Passo em X não pode ser zero para mais de 1 coluna.");
    }
    if (l.rows > 1 && Math.abs(l.dy) < EPSILON) {
      errors.push("Passo em Y não pode ser zero para mais de 1 linha.");
    }

    if (holeRadius > 0) {
      if (l.cols > 1 && Math.abs(l.dx) < holeDia) {
        errors.push(`Passo em X (${Math.abs(l.dx).toFixed(1)} mm) é menor que o diâmetro do furo (Ø ${holeDia.toFixed(1)} mm).`);
      }
      if (l.rows > 1 && Math.abs(l.dy) < holeDia) {
        errors.push(`Passo em Y (${Math.abs(l.dy).toFixed(1)} mm) é menor que o diâmetro do furo (Ø ${holeDia.toFixed(1)} mm).`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
