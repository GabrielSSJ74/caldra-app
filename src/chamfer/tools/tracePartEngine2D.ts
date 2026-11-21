/**
 * CALDRA CHAMFER — MOTOR "TRAÇAR PEÇA" (TRIM INVERSO / PASSAR A LIMPO)
 *
 * Reutiliza 100% do núcleo analítico exato de interseções e subdivisão do `trimEngine2D.ts`
 * SEM modificar nem regredir a ferramenta TRIM / APARAR:
 *  - Opera simultaneamente sobre entidades do Modo Gabarito (`isReferenceGuide: true`) e
 *    entidades vetoriais reais;
 *  - Permite marcar por Toque Direto ou Arraste contínuo ("pincel / faca") quais sub-trechos
 *    reais (linhas, arcos e círculos) pertencem à peça final;
 *  - Ao confirmar `[ ✓ Criar Peça (N) ]`, promove EXCLUSIVAMENTE os sub-trechos selecionados
 *    para entidades vetoriais definitivas (`isReferenceGuide: false`, `isConstruction: false`)
 *    com extremidades exatamente costuradas nos pontos analíticos de interseção, fundindo
 *    sub-arcos contíguos do mesmo círculo e removendo duplicatas em 1 único passo atômico de Undo;
 *  - Oferece utilitários atômicos para contar e limpar entidades de gabarito (`removeAllReferenceGuides`).
 */

import { dist, uid, type Entity, type LayerId, type Vec2 } from "@/lib/lab2d/core";
import {
  collectTrimSubPiecesCrossedByFence,
  decomposeEntityForTrim,
  hitTestTrimSubPiece,
  trimPrimitiveToSvgPath,
  type TrimGeometricPrimitive,
  type TrimSubPiece,
} from "@/chamfer/tools/trimEngine2D";

export type { TrimGeometricPrimitive, TrimSubPiece };
export { trimPrimitiveToSvgPath };

export interface TracePartPreview {
  /** Sub-trechos selecionados pelo usuário que serão promovidos para a peça final */
  selectedPieces: TrimSubPiece[];
  /** Nós exatos de interseção das extremidades dos trechos selecionados */
  intersectionMarkers: Vec2[];
  /** Quantidade de entidades de gabarito atualmente no desenho */
  guideEntitiesCount: number;
}

export interface TracePartCommitResult {
  /** Lista completa de entidades resultante (gabaritos preservados + novas entidades vetoriais reais) */
  updatedEntities: Entity[];
  /** Apenas as novas entidades vetoriais reais criadas nesta passagem */
  createdRealEntities: Entity[];
  /** Quantidade de sub-trechos promovidos */
  promotedCount: number;
}

const TWO_PI = Math.PI * 2;
const DEDUP_TOL = 0.02;

function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

function ccwSweep(a0: number, a1: number): number {
  let s = normAngle(a1) - normAngle(a0);
  if (s <= 1e-9) s += TWO_PI;
  return s;
}

function ptOnCircle(cx: number, cy: number, r: number, a: number): Vec2 {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * Conta quantas entidades de Gabarito (`isReferenceGuide === true`) existem no desenho.
 */
export function countReferenceGuideEntities(entities: Entity[]): number {
  let count = 0;
  for (const e of entities) {
    if (e.isReferenceGuide) count++;
  }
  return count;
}

/**
 * Remove todas as entidades marcadas como Gabarito (`isReferenceGuide === true`),
 * preservando 100% das entidades vetoriais definitivas.
 */
export function removeAllReferenceGuides(entities: Entity[]): {
  updatedEntities: Entity[];
  removedCount: number;
} {
  const updatedEntities: Entity[] = [];
  let removedCount = 0;
  for (const e of entities) {
    if (e.isReferenceGuide) {
      removedCount++;
    } else {
      updatedEntities.push(e);
    }
  }
  return { updatedEntities, removedCount };
}

/**
 * Hit-test analítico exato para a ferramenta "Traçar Peça" (reaproveita o motor do TRIM).
 */
export function hitTestTraceSubPiece(
  worldPt: Vec2,
  entities: Entity[],
  tolMm: number,
): TrimSubPiece | null {
  const hit = hitTestTrimSubPiece(worldPt, entities, tolMm, "real");
  return hit ? hit.subPiece : null;
}

/**
 * Arraste contínuo ("pincel / faca") para a ferramenta "Traçar Peça":
 * devolve todos os sub-trechos reais efetivamente cruzados pelo traço do dedo/mouse.
 */
export function collectTraceSubPiecesCrossedByFence(
  fencePolyline: Vec2[],
  entities: Entity[],
  _hitTolMm?: number,
): TrimSubPiece[] {
  return collectTrimSubPiecesCrossedByFence(fencePolyline, entities, "real");
}

/**
 * Constrói a prévia visual em tempo real dos sub-trechos marcados para "Passar a Limpo".
 */
export function buildTracePartPreview(
  entities: Entity[],
  markedKeys: string[],
): TracePartPreview {
  const keySet = new Set<string>(markedKeys);
  const guideEntitiesCount = countReferenceGuideEntities(entities);

  if (keySet.size === 0) {
    return {
      selectedPieces: [],
      intersectionMarkers: [],
      guideEntitiesCount,
    };
  }

  const affectedEntityIds = new Set<string>();
  for (const k of keySet) {
    const id = k.split(":")[0];
    if (id) affectedEntityIds.add(id);
  }

  const selectedPieces: TrimSubPiece[] = [];
  const intersectionMarkers: Vec2[] = [];

  const pushMarker = (pt: Vec2) => {
    if (!intersectionMarkers.some((m) => dist(m, pt) <= 0.05)) {
      intersectionMarkers.push(pt);
    }
  };

  for (const e of entities) {
    if (!affectedEntityIds.has(e.id)) continue;
    const decomp = decomposeEntityForTrim(e, entities, "real");
    if (!decomp) continue;
    for (const sp of decomp.subPieces) {
      if (!keySet.has(sp.key)) continue;
      selectedPieces.push(sp);
      for (const cp of sp.cutPoints) pushMarker(cp);
      if (sp.primitive.kind === "line") {
        pushMarker(sp.primitive.p1);
        pushMarker(sp.primitive.p2);
      } else if (sp.primitive.kind === "arc") {
        pushMarker(ptOnCircle(sp.primitive.cx, sp.primitive.cy, sp.primitive.r, sp.primitive.a0));
        pushMarker(ptOnCircle(sp.primitive.cx, sp.primitive.cy, sp.primitive.r, sp.primitive.a1));
      }
    }
  }

  return {
    selectedPieces,
    intersectionMarkers,
    guideEntitiesCount,
  };
}

/**
 * Verifica se duas primitivas vetoriais reais são geometricamente idênticas (deduplicação).
 */
function isDuplicateRealEntity(candidate: Entity, existing: Entity[]): boolean {
  for (const e of existing) {
    if (e.isReferenceGuide || e.isConstruction) continue;
    if (candidate.type === "line" && e.type === "line") {
      const a1 = { x: candidate.x1, y: candidate.y1 };
      const a2 = { x: candidate.x2, y: candidate.y2 };
      const b1 = { x: e.x1, y: e.y1 };
      const b2 = { x: e.x2, y: e.y2 };
      if (
        (dist(a1, b1) <= DEDUP_TOL && dist(a2, b2) <= DEDUP_TOL) ||
        (dist(a1, b2) <= DEDUP_TOL && dist(a2, b1) <= DEDUP_TOL)
      ) {
        return true;
      }
    } else if (candidate.type === "circle" && e.type === "circle") {
      if (
        Math.hypot(candidate.cx - e.cx, candidate.cy - e.cy) <= DEDUP_TOL &&
        Math.abs(candidate.r - e.r) <= DEDUP_TOL
      ) {
        return true;
      }
    } else if (candidate.type === "arc" && e.type === "arc") {
      if (
        Math.hypot(candidate.cx - e.cx, candidate.cy - e.cy) <= DEDUP_TOL &&
        Math.abs(candidate.r - e.r) <= DEDUP_TOL
      ) {
        const sA0 = ptOnCircle(candidate.cx, candidate.cy, candidate.r, candidate.a0);
        const sA1 = ptOnCircle(candidate.cx, candidate.cy, candidate.r, candidate.a1);
        const sB0 = ptOnCircle(e.cx, e.cy, e.r, e.a0);
        const sB1 = ptOnCircle(e.cx, e.cy, e.r, e.a1);
        const swA = ccwSweep(candidate.a0, candidate.a1);
        const swB = ccwSweep(e.a0, e.a1);
        if (
          dist(sA0, sB0) <= DEDUP_TOL &&
          dist(sA1, sB1) <= DEDUP_TOL &&
          Math.abs(swA - swB) <= 1e-2
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Funde sub-arcos contíguos selecionados pertencentes ao mesmo círculo/arco original
 * para gerar um arco contínuo limpo (ou círculo completo se os arcos fecham 360°).
 */
function mergeSelectedArcsOnSameCircle(
  arcs: Array<Extract<TrimGeometricPrimitive, { kind: "arc" }>>,
  layer: LayerId,
): Entity[] {
  if (arcs.length === 0) return [];
  const cx = arcs[0]!.cx;
  const cy = arcs[0]!.cy;
  const r = arcs[0]!.r;
  const items = arcs.map((a) => ({ a0: normAngle(a.a0), a1: normAngle(a.a1) }));

  let changed = true;
  while (changed && items.length > 1) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const diff = Math.abs(normAngle(items[i]!.a1 - items[j]!.a0));
        if (diff < 1e-3 || Math.abs(diff - TWO_PI) < 1e-3) {
          const total = ccwSweep(items[i]!.a0, items[i]!.a1) + ccwSweep(items[j]!.a0, items[j]!.a1);
          if (total >= TWO_PI - 1e-3) {
            return [
              {
                id: uid(),
                layer,
                type: "circle",
                cx,
                cy,
                r,
                isReferenceGuide: false,
                isConstruction: false,
              },
            ];
          }
          items[i] = { a0: items[i]!.a0, a1: items[j]!.a1 };
          items.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return items.map((a) => ({
    id: uid(),
    layer,
    type: "arc" as const,
    cx,
    cy,
    r,
    a0: a.a0,
    a1: a.a1,
    isReferenceGuide: false,
    isConstruction: false,
  }));
}

/**
 * Promove os sub-trechos selecionados em `Traçar Peça` para entidades vetoriais definitivas
 * (`line`, `arc`, `circle`) com `isReferenceGuide: false`, prontas para extrusão 3D e DXF!
 */
export function commitTracePartToRealEntities(
  entities: Entity[],
  markedKeys: string[],
  targetLayer: LayerId = "corte",
): TracePartCommitResult {
  const preview = buildTracePartPreview(entities, markedKeys);
  if (preview.selectedPieces.length === 0) {
    return {
      updatedEntities: entities,
      createdRealEntities: [],
      promotedCount: 0,
    };
  }

  // Agrupa sub-arcos por entidade original para fundir trechos contíguos do mesmo círculo/arco
  const arcsByOrigin = new Map<string, Array<Extract<TrimGeometricPrimitive, { kind: "arc" }>>>();
  const candidates: Entity[] = [];

  for (const sp of preview.selectedPieces) {
    const prim = sp.primitive;
    if (prim.kind === "line") {
      if (dist(prim.p1, prim.p2) < 1e-3) continue;
      candidates.push({
        id: uid(),
        layer: targetLayer,
        type: "line",
        x1: Number(prim.p1.x.toFixed(4)),
        y1: Number(prim.p1.y.toFixed(4)),
        x2: Number(prim.p2.x.toFixed(4)),
        y2: Number(prim.p2.y.toFixed(4)),
        isReferenceGuide: false,
        isConstruction: false,
      });
    } else if (prim.kind === "circle") {
      candidates.push({
        id: uid(),
        layer: targetLayer,
        type: "circle",
        cx: prim.cx,
        cy: prim.cy,
        r: prim.r,
        isReferenceGuide: false,
        isConstruction: false,
      });
    } else if (prim.kind === "arc") {
      const list = arcsByOrigin.get(sp.entityId) ?? [];
      list.push(prim);
      arcsByOrigin.set(sp.entityId, list);
    }
  }

  for (const [, arcList] of arcsByOrigin) {
    candidates.push(...mergeSelectedArcsOnSameCircle(arcList, targetLayer));
  }

  // Deduplica contra entidades reais já existentes e entre si
  const createdRealEntities: Entity[] = [];
  const checkPool = [...entities];
  for (const cand of candidates) {
    if (!isDuplicateRealEntity(cand, checkPool)) {
      createdRealEntities.push(cand);
      checkPool.push(cand);
    }
  }

  return {
    updatedEntities: [...entities, ...createdRealEntities],
    createdRealEntities,
    promotedCount: preview.selectedPieces.length,
  };
}
