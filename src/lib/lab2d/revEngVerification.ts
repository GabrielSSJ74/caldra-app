/**
 * CALDRA CHAMFER CAD — ENGENHARIA REVERSA (FASE F)
 * Detector de Erros de Geometria e Fabricação, Fechamento Controlado de Contornos Abertos (T15),
 * Comparador Multi-Nível Medido × Desenhado e Ponto × Geometria (T12 / T17),
 * Prova de Impressão 1:1 com Barra de 100,000 mm e Cruzes de Canto (T18),
 * Calibração de Tela por Cartão ID-1 e Mapa Visual Qualitativo de Confiança (Seção 13).
 *
 * Restrito estritamente ao escopo `src/lib/lab2d`.
 */

import type { Entity, Vec2 } from "./core";
import {
  REV_ENG_STATUS_META,
  type CapturedContourPoint,
  type MeasurementRecord,
  type RevEngInfoStatus,
  type RevEngReferenceImage,
  type RevEngRegion25D,
} from "./revEngTypes";

// ============================================================================
// 1. UTILITÁRIOS DE DISTÂNCIA PONTO-ENTIDADE E INTERSEÇÃO DE SEGMENTOS
// ============================================================================

export function distPointToSegmentMm(p: Vec2, a: Vec2, b: Vec2): { distMm: number; closestPt: Vec2 } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-12) {
    return { distMm: Math.hypot(p.x - a.x, p.y - a.y), closestPt: { x: a.x, y: a.y } };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
  const cx = a.x + t * vx;
  const cy = a.y + t * vy;
  return {
    distMm: Math.hypot(p.x - cx, p.y - cy),
    closestPt: { x: cx, y: cy },
  };
}

function normalizeAngle0To2Pi(ang: number): number {
  const twoPi = Math.PI * 2;
  return ((ang % twoPi) + twoPi) % twoPi;
}

function isAngleOnArc(angle: number, startAngle: number, endAngle: number): boolean {
  const a = normalizeAngle0To2Pi(angle);
  const s = normalizeAngle0To2Pi(startAngle);
  const e = normalizeAngle0To2Pi(endAngle);
  if (s <= e) return a >= s - 1e-6 && a <= e + 1e-6;
  return a >= s - 1e-6 || a <= e + 1e-6;
}

export function distPointToEntityMm(p: Vec2, entity: Entity): { distMm: number; closestPt: Vec2 } {
  if (entity.type === "line") {
    return distPointToSegmentMm(p, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
  }

  if (entity.type === "circle") {
    const dx = p.x - entity.cx;
    const dy = p.y - entity.cy;
    const dCenter = Math.hypot(dx, dy);
    if (dCenter < 1e-9) {
      return {
        distMm: entity.r,
        closestPt: { x: entity.cx + entity.r, y: entity.cy },
      };
    }
    return {
      distMm: Math.abs(dCenter - entity.r),
      closestPt: {
        x: entity.cx + (dx / dCenter) * entity.r,
        y: entity.cy + (dy / dCenter) * entity.r,
      },
    };
  }

  if (entity.type === "arc") {
    const dx = p.x - entity.cx;
    const dy = p.y - entity.cy;
    const ang = Math.atan2(dy, dx);
    if (isAngleOnArc(ang, entity.startAngle, entity.endAngle)) {
      const dCenter = Math.hypot(dx, dy);
      return {
        distMm: Math.abs(dCenter - entity.r),
        closestPt: {
          x: entity.cx + Math.cos(ang) * entity.r,
          y: entity.cy + Math.sin(ang) * entity.r,
        },
      };
    }
    const pStart = {
      x: entity.cx + entity.r * Math.cos(entity.startAngle),
      y: entity.cy + entity.r * Math.sin(entity.startAngle),
    };
    const pEnd = {
      x: entity.cx + entity.r * Math.cos(entity.endAngle),
      y: entity.cy + entity.r * Math.sin(entity.endAngle),
    };
    const dS = Math.hypot(p.x - pStart.x, p.y - pStart.y);
    const dE = Math.hypot(p.x - pEnd.x, p.y - pEnd.y);
    return dS <= dE
      ? { distMm: dS, closestPt: pStart }
      : { distMm: dE, closestPt: pEnd };
  }

  if (entity.type === "polyline" && entity.pts.length >= 2) {
    let bestDist = Infinity;
    let bestPt: Vec2 = entity.pts[0]!;
    const count = entity.closed ? entity.pts.length : entity.pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = entity.pts[i]!;
      const b = entity.pts[(i + 1) % entity.pts.length]!;
      const res = distPointToSegmentMm(p, a, b);
      if (res.distMm < bestDist) {
        bestDist = res.distMm;
        bestPt = res.closestPt;
      }
    }
    return { distMm: bestDist, closestPt: bestPt };
  }

  return { distMm: Infinity, closestPt: p };
}

function segmentsProperlyIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const rX = a2.x - a1.x;
  const rY = a2.y - a1.y;
  const sX = b2.x - b1.x;
  const sY = b2.y - b1.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;

  const qpX = b1.x - a1.x;
  const qpY = b1.y - a1.y;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;

  const eps = 1e-4;
  if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
    return {
      x: a1.x + t * rX,
      y: a1.y + t * rY,
    };
  }
  return null;
}

// ============================================================================
// 2. DETECTOR DE ERROS GEOMÉTRICOS E FECHAMENTO CONTROLADO (SEÇÃO 13.1 & T15)
// ============================================================================

export type RevEngDetectedErrorKind =
  | "CONTORNO_ABERTO_LACUNA"
  | "SEGMENTO_DUPLICADO"
  | "EXTREMIDADES_DESCONECTADAS"
  | "AUTOINTERSECAO"
  | "GEOMETRIA_DEGENERADA"
  | "COTA_INCONSISTENTE_COM_MEDIDA"
  | "SIMETRIA_APROXIMADA"
  | "AUXILIAR_EM_CAMADA_CORTE";

export type RevEngSafeFixActionKind =
  | "close_polyline_gap"
  | "bridge_line_chain_gap"
  | "snap_endpoints_to_midpoint"
  | "remove_duplicate_entity"
  | "remove_degenerate_entity"
  | "move_auxiliary_to_construction"
  | "none";

export interface RevEngDetectedErrorItem {
  id: string;
  kind: RevEngDetectedErrorKind;
  severity: "critico" | "aviso" | "sugestao";
  title: string;
  description: string;
  location: Vec2;
  involvedEntityIds: string[];
  gapOrDiscrepancyMm?: number;
  canApplySafeFix: boolean;
  possibleFixLabel: string;
  fixActionKind: RevEngSafeFixActionKind;
  fixPayload?: {
    targetEntityId?: string;
    secondEntityId?: string;
    bridgeP1?: Vec2;
    bridgeP2?: Vec2;
  };
}

export interface RevEngErrorAuditReport {
  closingToleranceMm: number;
  fabricationToleranceMm: number;
  totalCount: number;
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
  items: RevEngDetectedErrorItem[];
}

export function detectRevEngGeometryErrors(params: {
  entities: Entity[];
  measurements?: MeasurementRecord[];
  /** Tolerância geométrica de fechamento de contorno (padrão 2.0 mm, distinta da de fabricação) */
  closingToleranceMm?: number;
  /** Tolerância dimensional de fabricação (padrão 0.15 mm) */
  fabricationToleranceMm?: number;
}): RevEngErrorAuditReport {
  const {
    entities,
    measurements = [],
    closingToleranceMm = 2.0,
    fabricationToleranceMm = 0.15,
  } = params;

  const items: RevEngDetectedErrorItem[] = [];
  const nonConst = entities.filter((e) => !e.isConstruction);

  // 1. Verificar polilinhas abertas que deveriam fechar (lacuna entre primeiro e último ponto — Teste T15)
  for (const e of nonConst) {
    if (e.type === "polyline" && !e.closed && e.pts.length >= 3) {
      const pFirst = e.pts[0]!;
      const pLast = e.pts[e.pts.length - 1]!;
      const gap = Math.hypot(pLast.x - pFirst.x, pLast.y - pFirst.y);

      if (gap <= closingToleranceMm * 3) {
        const isWithinClosingTol = gap <= closingToleranceMm;
        items.push({
          id: `err-open-poly-${e.id}`,
          kind: "CONTORNO_ABERTO_LACUNA",
          severity: "critico",
          title: `Contorno aberto com lacuna de ${gap.toFixed(3)} mm`,
          description: isWithinClosingTol
            ? `A polilinha "${e.id}" possui extremidades separadas por ${gap.toFixed(3)} mm (≤ tol. de fechamento ${closingToleranceMm.toFixed(2)} mm). Não fechada automaticamente: use a ação controlada para fechar com suporte a Desfazer (Undo).`
            : `A polilinha "${e.id}" está aberta com lacuna de ${gap.toFixed(2)} mm (> tol. ${closingToleranceMm.toFixed(2)} mm). Fechamento exigido para corte CNC ou extrusão 3D.`,
          location: { x: (pFirst.x + pLast.x) * 0.5, y: (pFirst.y + pLast.y) * 0.5 },
          involvedEntityIds: [e.id],
          gapOrDiscrepancyMm: gap,
          canApplySafeFix: true,
          possibleFixLabel: "Fechar Contorno Controlado (Undo)",
          fixActionKind: "close_polyline_gap",
          fixPayload: {
            targetEntityId: e.id,
            bridgeP1: pLast,
            bridgeP2: pFirst,
          },
        });
      }
    }
  }

  // 2. Verificar cadeias de segmentos de reta (line) que quase fecham mas têm uma pequena lacuna (Teste T15)
  const lines = nonConst.filter(
    (e): e is Extract<Entity, { type: "line" }> => e.type === "line",
  );

  // Detectar linhas degeneradas (comprimento ~ 0)
  for (const ln of lines) {
    const len = Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1);
    if (len < 0.05) {
      items.push({
        id: `err-degen-line-${ln.id}`,
        kind: "GEOMETRIA_DEGENERADA",
        severity: "critico",
        title: `Segmento degenerado (${len.toFixed(4)} mm)`,
        description: `A reta "${ln.id}" possui comprimento quase nulo (${len.toFixed(4)} mm).`,
        location: { x: ln.x1, y: ln.y1 },
        involvedEntityIds: [ln.id],
        gapOrDiscrepancyMm: len,
        canApplySafeFix: true,
        possibleFixLabel: "Remover Segmento Degenerado",
        fixActionKind: "remove_degenerate_entity",
        fixPayload: { targetEntityId: ln.id },
      });
    }
  }

  // Detectar segmentos duplicados ou sobrepostos
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const directMatch =
        Math.hypot(a.x1 - b.x1, a.y1 - b.y1) <= fabricationToleranceMm &&
        Math.hypot(a.x2 - b.x2, a.y2 - b.y2) <= fabricationToleranceMm;
      const reverseMatch =
        Math.hypot(a.x1 - b.x2, a.y1 - b.y2) <= fabricationToleranceMm &&
        Math.hypot(a.x2 - b.x1, a.y2 - b.y1) <= fabricationToleranceMm;

      if (directMatch || reverseMatch) {
        items.push({
          id: `err-dup-line-${a.id}-${b.id}`,
          kind: "SEGMENTO_DUPLICADO",
          severity: "aviso",
          title: `Segmentos duplicados (${a.id} / ${b.id})`,
          description: `Duas retas coincidem dentro de ${fabricationToleranceMm.toFixed(2)} mm. Podem causar dupla passagem de corte no CNC.`,
          location: { x: (a.x1 + a.x2) * 0.5, y: (a.y1 + a.y2) * 0.5 },
          involvedEntityIds: [a.id, b.id],
          gapOrDiscrepancyMm: 0,
          canApplySafeFix: true,
          possibleFixLabel: "Remover Duplicata",
          fixActionKind: "remove_duplicate_entity",
          fixPayload: { targetEntityId: b.id },
        });
      }
    }
  }

  // Detectar extremidades próximas e não conectadas entre linhas (0.001 < d <= closingToleranceMm)
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const pairs: Array<{ pa: Vec2; pb: Vec2 }> = [
        { pa: { x: a.x1, y: a.y1 }, pb: { x: b.x1, y: b.y1 } },
        { pa: { x: a.x1, y: a.y1 }, pb: { x: b.x2, y: b.y2 } },
        { pa: { x: a.x2, y: a.y2 }, pb: { x: b.x1, y: b.y1 } },
        { pa: { x: a.x2, y: a.y2 }, pb: { x: b.x2, y: b.y2 } },
      ];

      for (const pair of pairs) {
        const d = Math.hypot(pair.pa.x - pair.pb.x, pair.pa.y - pair.pb.y);
        if (d > 1e-3 && d <= closingToleranceMm) {
          items.push({
            id: `err-gap-lines-${a.id}-${b.id}-${Math.round(d * 1000)}`,
            kind: "CONTORNO_ABERTO_LACUNA",
            severity: "critico",
            title: `Lacuna de ${d.toFixed(3)} mm entre extremidades`,
            description: `As extremidades de "${a.id}" e "${b.id}" estão separadas por ${d.toFixed(3)} mm (≤ tol. fechamento ${closingToleranceMm.toFixed(2)} mm).`,
            location: { x: (pair.pa.x + pair.pb.x) * 0.5, y: (pair.pa.y + pair.pb.y) * 0.5 },
            involvedEntityIds: [a.id, b.id],
            gapOrDiscrepancyMm: d,
            canApplySafeFix: true,
            possibleFixLabel: "Unir Extremidades / Inserir Fecho (Undo)",
            fixActionKind: "bridge_line_chain_gap",
            fixPayload: {
              targetEntityId: a.id,
              secondEntityId: b.id,
              bridgeP1: pair.pa,
              bridgeP2: pair.pb,
            },
          });
          break;
        }
      }
    }
  }

  // 3. Detectar autointerseções em polilinhas
  for (const e of nonConst) {
    if (e.type === "polyline" && e.pts.length >= 4) {
      const segCount = e.closed ? e.pts.length : e.pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a1 = e.pts[i]!;
        const a2 = e.pts[(i + 1) % e.pts.length]!;
        for (let j = i + 2; j < segCount; j++) {
          if (e.closed && i === 0 && j === segCount - 1) continue;
          const b1 = e.pts[j]!;
          const b2 = e.pts[(j + 1) % e.pts.length]!;
          const hit = segmentsProperlyIntersect(a1, a2, b1, b2);
          if (hit) {
            items.push({
              id: `err-self-intersect-${e.id}-${i}-${j}`,
              kind: "AUTOINTERSECAO",
              severity: "critico",
              title: `Autointerseção detectada no contorno`,
              description: `Os segmentos #${i + 1} e #${j + 1} da polilinha "${e.id}" cruzam-se em (${hit.x.toFixed(1)}; ${hit.y.toFixed(1)}) mm.`,
              location: hit,
              involvedEntityIds: [e.id],
              canApplySafeFix: false,
              possibleFixLabel: "Edição manual de vértices necessária",
              fixActionKind: "none",
            });
          }
        }
      }
    }
  }

  // 4. Detectar divergências entre Cota do Desenho e Medição Registrada no Caderno
  for (const m of measurements) {
    if (typeof m.discrepancyMm === "number" && m.discrepancyMm > m.uncertaintyMmOrDeg) {
      items.push({
        id: `err-meas-mismatch-${m.id}`,
        kind: "COTA_INCONSISTENTE_COM_MEDIDA",
        severity: "critico",
        title: `Divergência Medido × Desenhado em ${m.code} (${m.label})`,
        description: `Valor medido (${m.valueMmOrDeg.toFixed(2)} ${m.unit}) difere da geometria desenhada (${(m.drawnNominalValue ?? 0).toFixed(2)} ${m.unit}) em Δ = ${m.discrepancyMm.toFixed(2)} ${m.unit} (> incerteza ±${m.uncertaintyMmOrDeg.toFixed(2)}).`,
        location: { x: 0, y: 0 },
        involvedEntityIds: m.linkedEntityId ? [m.linkedEntityId] : [],
        gapOrDiscrepancyMm: m.discrepancyMm,
        canApplySafeFix: false,
        possibleFixLabel: "Revisar no Caderno de Medições",
        fixActionKind: "none",
      });
    }
  }

  // 5. Detectar Simetria Aproximada que não é exata (Seção 13.1 & T13)
  const circles = nonConst.filter(
    (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
  );
  if (circles.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of nonConst) {
      if (e.type === "polyline") {
        for (const p of e.pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
      } else if (e.type === "circle") {
        if (e.cx - e.r < minX) minX = e.cx - e.r;
        if (e.cx + e.r > maxX) maxX = e.cx + e.r;
      }
    }
    const midX = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) * 0.5 : 0;

    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const c1 = circles[i]!;
        const c2 = circles[j]!;
        const mirroredX1 = 2 * midX - c1.cx;
        const dxMirror = Math.abs(mirroredX1 - c2.cx);
        const dyMirror = Math.abs(c1.cy - c2.cy);
        const dDiam = Math.abs(c1.r * 2 - c2.r * 2);
        const totalAsym = Math.hypot(dxMirror, dyMirror) + dDiam;

        if (
          totalAsym > fabricationToleranceMm &&
          dxMirror <= 3.0 &&
          dyMirror <= 3.0 &&
          dDiam <= 2.0 &&
          Math.abs(c1.cx - c2.cx) > 5.0
        ) {
          items.push({
            id: `err-approx-sym-${c1.id}-${c2.id}`,
            kind: "SIMETRIA_APROXIMADA",
            severity: "sugestao",
            title: `Simetria aproximada não exata entre furos (${c1.id} / ${c2.id})`,
            description: `Em relação ao eixo X = ${midX.toFixed(2)} mm: ΔX_sim = ${dxMirror.toFixed(2)} mm, ΔY = ${dyMirror.toFixed(2)} mm, ΔØ = ${dDiam.toFixed(2)} mm.`,
            location: { x: midX, y: (c1.cy + c2.cy) * 0.5 },
            involvedEntityIds: [c1.id, c2.id],
            gapOrDiscrepancyMm: totalAsym,
            canApplySafeFix: false,
            possibleFixLabel: "Avaliar na Intenção de Projeto / Simetria",
            fixActionKind: "none",
          });
        }
      }
    }
  }

  // 6. Detectar entidade auxiliar / hipótese na camada de corte CNC
  for (const e of entities) {
    const status = e.params?.infoStatus as RevEngInfoStatus | undefined;
    if (
      (e.layer || "corte") === "corte" &&
      !e.isConstruction &&
      (status === "HIPOTESE" || e.params?.featureKind === "stl_mesh_slice")
    ) {
      items.push({
        id: `err-aux-on-cut-${e.id}`,
        kind: "AUXILIAR_EM_CAMADA_CORTE",
        severity: "aviso",
        title: `Geometria provisória/auxiliar na camada de CORTE (${e.id})`,
        description: `Entidade marcada como ${status ?? "AUXILIAR"} está na camada de corte final. Mova para Construção ou confirme a medição antes de fabricar.`,
        location: { x: 0, y: 0 },
        involvedEntityIds: [e.id],
        canApplySafeFix: true,
        possibleFixLabel: "Mover para Camada Construção",
        fixActionKind: "move_auxiliary_to_construction",
        fixPayload: { targetEntityId: e.id },
      });
    }
  }

  const criticalCount = items.filter((i) => i.severity === "critico").length;
  const warningCount = items.filter((i) => i.severity === "aviso").length;
  const suggestionCount = items.filter((i) => i.severity === "sugestao").length;

  return {
    closingToleranceMm,
    fabricationToleranceMm,
    totalCount: items.length,
    criticalCount,
    warningCount,
    suggestionCount,
    items,
  };
}

/**
 * Aplica de forma explícita e controlada a correção de um erro geométrico detectado,
 * retornando uma nova lista de entidades pronta para `commit` (preservando Undo/Redo integral — Teste T15).
 */
export function applyControlledErrorFix(params: {
  entities: Entity[];
  errorItem: RevEngDetectedErrorItem;
}): {
  nextEntities: Entity[];
  undoLabel: string;
  applied: boolean;
} {
  const { entities, errorItem } = params;
  const payload = errorItem.fixPayload;

  if (!errorItem.canApplySafeFix || !payload) {
    return { nextEntities: entities, undoLabel: "Nenhuma alteração", applied: false };
  }

  if (errorItem.fixActionKind === "close_polyline_gap" && payload.targetEntityId) {
    const nextEntities = entities.map((e) => {
      if (e.id === payload.targetEntityId && e.type === "polyline") {
        // Se o último ponto está muito próximo do primeiro, fechamos o flag `closed: true`
        const p0 = e.pts[0]!;
        const pN = e.pts[e.pts.length - 1]!;
        const gap = Math.hypot(pN.x - p0.x, pN.y - p0.y);
        const cleanPts =
          gap < 1e-4 && e.pts.length > 3 ? e.pts.slice(0, -1) : e.pts;
        return {
          ...e,
          pts: cleanPts,
          closed: true,
        };
      }
      return e;
    });
    return {
      nextEntities,
      undoLabel: `Fechar Contorno (${payload.targetEntityId})`,
      applied: true,
    };
  }

  if (
    errorItem.fixActionKind === "bridge_line_chain_gap" &&
    payload.bridgeP1 &&
    payload.bridgeP2
  ) {
    const bridgeLine: Entity = {
      id: `reveng-gap-bridge-${Date.now()}`,
      type: "line",
      layer: "corte",
      x1: payload.bridgeP1.x,
      y1: payload.bridgeP1.y,
      x2: payload.bridgeP2.x,
      y2: payload.bridgeP2.y,
      params: { infoStatus: "CALCULADO", featureKind: "controlled_gap_closure" },
    };
    return {
      nextEntities: [...entities, bridgeLine],
      undoLabel: `Inserir Fecho de Lacuna (${(errorItem.gapOrDiscrepancyMm ?? 0).toFixed(2)} mm)`,
      applied: true,
    };
  }

  if (
    (errorItem.fixActionKind === "remove_duplicate_entity" ||
      errorItem.fixActionKind === "remove_degenerate_entity") &&
    payload.targetEntityId
  ) {
    return {
      nextEntities: entities.filter((e) => e.id !== payload.targetEntityId),
      undoLabel: `Remover Entidade Inválida/Duplicada (${payload.targetEntityId})`,
      applied: true,
    };
  }

  if (
    errorItem.fixActionKind === "move_auxiliary_to_construction" &&
    payload.targetEntityId
  ) {
    return {
      nextEntities: entities.map((e) =>
        e.id === payload.targetEntityId
          ? { ...e, layer: "construcao", isConstruction: true }
          : e,
      ),
      undoLabel: `Mover ${payload.targetEntityId} para Construção`,
      applied: true,
    };
  }

  return { nextEntities: entities, undoLabel: "Nenhuma alteração", applied: false };
}

// ============================================================================
// 3. COMPARADOR MULTI-NÍVEL: MEDIDO × DESENHADO E PONTO × GEOMETRIA (SEÇÃO 13.2 & T17)
// ============================================================================

export interface ComparatorMeasurementRow {
  measurementId: string;
  code: string;
  label: string;
  unit: "mm" | "°";
  measuredValue: number;
  drawnValue: number | null;
  signedDiff: number | null;
  absDiff: number | null;
  tolerance: number;
  withinTolerance: boolean | null;
  infoStatus: RevEngInfoStatus;
}

export interface PointGeometryDeviationItem {
  pointId: string;
  point: Vec2;
  nearestEntityId: string | null;
  closestPointOnGeometry: Vec2;
  deviationMm: number;
  withinTolerance: boolean;
}

export interface ComparatorInspectionReport {
  measurementRows: ComparatorMeasurementRow[];
  compatibleMeasurementsCount: number;
  divergentMeasurementsCount: number;
  pointDeviations: PointGeometryDeviationItem[];
  pointCount: number;
  rmsDeviationMm: number;
  meanDeviationMm: number;
  maxDeviationMm: number;
  worstPoint: PointGeometryDeviationItem | null;
  worstOutlierRegions: PointGeometryDeviationItem[];
  overallStatus: "aprovado" | "divergente" | "sem_dados";
}

export function evaluateRevEngComparator(params: {
  entities: Entity[];
  measurements: MeasurementRecord[];
  capturedPoints: CapturedContourPoint[];
  pointToleranceMm?: number;
}): ComparatorInspectionReport {
  const {
    entities,
    measurements,
    capturedPoints,
    pointToleranceMm = 0.25,
  } = params;

  const nonConst = entities.filter((e) => !e.isConstruction);

  // (1) Tabela Medido × Desenhado × Diferença
  let compatibleMeasurementsCount = 0;
  let divergentMeasurementsCount = 0;

  const measurementRows: ComparatorMeasurementRow[] = measurements.map((m) => {
    const drawn = typeof m.drawnNominalValue === "number" ? m.drawnNominalValue : null;
    const signedDiff = drawn !== null ? drawn - m.valueMmOrDeg : null;
    const absDiff = signedDiff !== null ? Math.abs(signedDiff) : null;
    const tol = Math.max(0.005, m.uncertaintyMmOrDeg);
    const withinTolerance = absDiff !== null ? absDiff <= tol : null;

    if (withinTolerance === true) compatibleMeasurementsCount++;
    else if (withinTolerance === false) divergentMeasurementsCount++;

    return {
      measurementId: m.id,
      code: m.code,
      label: m.label,
      unit: m.unit,
      measuredValue: m.valueMmOrDeg,
      drawnValue: drawn,
      signedDiff,
      absDiff,
      tolerance: tol,
      withinTolerance,
      infoStatus: m.infoStatus,
    };
  });

  // (2) Desvio Ponto Medido/Capturado × Geometria Reconstruída (Teste T12 & T17)
  const pointDeviations: PointGeometryDeviationItem[] = [];
  let sumSq = 0;
  let sumAbs = 0;
  let maxDeviationMm = 0;
  let worstPoint: PointGeometryDeviationItem | null = null;

  if (nonConst.length > 0 && capturedPoints.length > 0) {
    for (const pt of capturedPoints) {
      let bestDist = Infinity;
      let bestClosest: Vec2 = { x: pt.x, y: pt.y };
      let bestEntityId: string | null = null;

      for (const ent of nonConst) {
        const res = distPointToEntityMm({ x: pt.x, y: pt.y }, ent);
        if (res.distMm < bestDist) {
          bestDist = res.distMm;
          bestClosest = res.closestPt;
          bestEntityId = ent.id;
        }
      }

      const dev = Number.isFinite(bestDist) ? bestDist : 0;
      const tol = Math.max(pointToleranceMm, pt.uncertaintyMm || 0.15);
      const item: PointGeometryDeviationItem = {
        pointId: pt.id,
        point: { x: pt.x, y: pt.y },
        nearestEntityId: bestEntityId,
        closestPointOnGeometry: bestClosest,
        deviationMm: dev,
        withinTolerance: dev <= tol,
      };

      pointDeviations.push(item);
      sumSq += dev * dev;
      sumAbs += dev;
      if (dev > maxDeviationMm || worstPoint === null) {
        maxDeviationMm = dev;
        worstPoint = item;
      }
    }
  }

  const pointCount = pointDeviations.length;
  const rmsDeviationMm = pointCount > 0 ? Math.sqrt(sumSq / pointCount) : 0;
  const meanDeviationMm = pointCount > 0 ? sumAbs / pointCount : 0;

  const worstOutlierRegions = [...pointDeviations]
    .filter((p) => !p.withinTolerance)
    .sort((a, b) => b.deviationMm - a.deviationMm)
    .slice(0, 5);

  const hasAnyData = measurementRows.length > 0 || pointCount > 0;
  const overallStatus: ComparatorInspectionReport["overallStatus"] = !hasAnyData
    ? "sem_dados"
    : divergentMeasurementsCount === 0 && worstOutlierRegions.length === 0
      ? "aprovado"
      : "divergente";

  return {
    measurementRows,
    compatibleMeasurementsCount,
    divergentMeasurementsCount,
    pointDeviations,
    pointCount,
    rmsDeviationMm,
    meanDeviationMm,
    maxDeviationMm,
    worstPoint,
    worstOutlierRegions,
    overallStatus,
  };
}

// ============================================================================
// 4. PROVA DE IMPRESSÃO 1:1 (GABARITO FÍSICO) E TAMANHO REAL NA TELA (SEÇÃO 13.3 & T18)
// ============================================================================

export interface PrintProof1to1Metadata {
  pageWidthMm: number;
  pageHeightMm: number;
  /** Comprimento exato da barra de verificação impressa (sempre 100.000 mm — Teste T18) */
  verificationBarLengthMm: number;
  verificationBarStart: Vec2;
  verificationBarEnd: Vec2;
  /** Distância horizontal exata centro-a-centro entre as cruzes de canto (mm) */
  cornerCrossSpanXMm: number;
  /** Distância vertical exata centro-a-centro entre as cruzes de canto (mm) */
  cornerCrossSpanYMm: number;
  /** Coordenadas exatas das 4 cruzes de canto na folha (mm) */
  cornerCrosses: [Vec2, Vec2, Vec2, Vec2];
  svgContent: string;
  instructionsPtBr: string;
}

export function generatePrintProof1to1Svg(params: {
  entities: Entity[];
  partTitle?: string;
  marginMm?: number;
}): PrintProof1to1Metadata {
  const { entities, partTitle = "PEÇA RECONSTRUÍDA — CHAMFER CAD", marginMm = 20 } = params;

  const fabEntities = entities.filter(
    (e) => !e.isConstruction && (e.layer === "corte" || e.layer === "recorte" || !e.layer),
  );

  // Calcular bounding box da peça em mm
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of fabEntities) {
    if (e.type === "line") {
      includePt(e.x1, e.y1);
      includePt(e.x2, e.y2);
    } else if (e.type === "circle" || e.type === "arc") {
      includePt(e.cx - e.r, e.cy - e.r);
      includePt(e.cx + e.r, e.cy + e.r);
    } else if (e.type === "polyline") {
      for (const p of e.pts) includePt(p.x, p.y);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 120;
    maxY = 80;
  }

  const partW = Math.max(100, maxX - minX);
  const partH = Math.max(50, maxY - minY);

  // Garantir largura suficiente para a barra de aferição de 100.000 mm + margens
  const pageWidthMm = Number(Math.max(160, partW + marginMm * 2).toFixed(3));
  const pageHeightMm = Number(Math.max(120, partH + marginMm * 2 + 35).toFixed(3));

  // As 4 cruzes de canto ficam a 10 mm das bordas da folha
  const crossInset = 10.0;
  const cTopLeft: Vec2 = { x: crossInset, y: crossInset };
  const cTopRight: Vec2 = { x: Number((pageWidthMm - crossInset).toFixed(3)), y: crossInset };
  const cBotRight: Vec2 = {
    x: Number((pageWidthMm - crossInset).toFixed(3)),
    y: Number((pageHeightMm - crossInset).toFixed(3)),
  };
  const cBotLeft: Vec2 = { x: crossInset, y: Number((pageHeightMm - crossInset).toFixed(3)) };

  const cornerCrossSpanXMm = Number((cTopRight.x - cTopLeft.x).toFixed(3));
  const cornerCrossSpanYMm = Number((cBotLeft.y - cTopLeft.y).toFixed(3));

  // Barra de verificação de exatos 100,000 mm
  const barStartX = Number((crossInset + 10.0).toFixed(3));
  const barEndX = Number((barStartX + 100.0).toFixed(3));
  const barY = Number((pageHeightMm - crossInset - 12.0).toFixed(3));
  const verificationBarLengthMm = Number((barEndX - barStartX).toFixed(3));

  // Translação para posicionar a peça em 1:1 dentro do quadro útil
  const offsetX = marginMm - minX;
  const offsetY = marginMm - minY;

  const svgElements: string[] = [];

  // Renderizar as 4 cruzes de canto (+) com indicação das distâncias exatas
  const cornerCrosses: [Vec2, Vec2, Vec2, Vec2] = [cTopLeft, cTopRight, cBotRight, cBotLeft];
  for (const c of cornerCrosses) {
    svgElements.push(
      `  <g class="corner-fiducial" stroke="#0F172A" stroke-width="0.35" fill="none">`,
      `    <line x1="${(c.x - 4).toFixed(3)}" y1="${c.y.toFixed(3)}" x2="${(c.x + 4).toFixed(3)}" y2="${c.y.toFixed(3)}" />`,
      `    <line x1="${c.x.toFixed(3)}" y1="${(c.y - 4).toFixed(3)}" x2="${c.x.toFixed(3)}" y2="${(c.y + 4).toFixed(3)}" />`,
      `    <circle cx="${c.x.toFixed(3)}" cy="${c.y.toFixed(3)}" r="1.5" />`,
      `  </g>`,
    );
  }

  // Geometria 1:1 da peça
  svgElements.push(`  <g id="part-geometry-1to1" stroke="#000000" stroke-width="0.40" fill="none">`);
  for (const e of fabEntities) {
    if (e.type === "line") {
      svgElements.push(
        `    <line x1="${(e.x1 + offsetX).toFixed(4)}" y1="${(e.y1 + offsetY).toFixed(4)}" x2="${(e.x2 + offsetX).toFixed(4)}" y2="${(e.y2 + offsetY).toFixed(4)}" />`,
      );
    } else if (e.type === "circle") {
      const cx = e.cx + offsetX;
      const cy = e.cy + offsetY;
      svgElements.push(
        `    <circle cx="${cx.toFixed(4)}" cy="${cy.toFixed(4)}" r="${e.r.toFixed(4)}" />`,
        // Mira de centro do furo para conferência física
        `    <line x1="${(cx - 2.5).toFixed(3)}" y1="${cy.toFixed(3)}" x2="${(cx + 2.5).toFixed(3)}" y2="${cy.toFixed(3)}" stroke="#475569" stroke-width="0.2" />`,
        `    <line x1="${cx.toFixed(3)}" y1="${(cy - 2.5).toFixed(3)}" x2="${cx.toFixed(3)}" y2="${(cy + 2.5).toFixed(3)}" stroke="#475569" stroke-width="0.2" />`,
      );
    } else if (e.type === "arc") {
      const x1 = e.cx + offsetX + e.r * Math.cos(e.startAngle);
      const y1 = e.cy + offsetY + e.r * Math.sin(e.startAngle);
      const x2 = e.cx + offsetX + e.r * Math.cos(e.endAngle);
      const y2 = e.cy + offsetY + e.r * Math.sin(e.endAngle);
      let sweep = e.endAngle - e.startAngle;
      while (sweep < 0) sweep += Math.PI * 2;
      const largeArc = sweep > Math.PI ? 1 : 0;
      svgElements.push(
        `    <path d="M ${x1.toFixed(4)} ${y1.toFixed(4)} A ${e.r.toFixed(4)} ${e.r.toFixed(4)} 0 ${largeArc} 1 ${x2.toFixed(4)} ${y2.toFixed(4)}" />`,
      );
    } else if (e.type === "polyline" && e.pts.length >= 2) {
      const ptsStr = e.pts
        .map((p) => `${(p.x + offsetX).toFixed(4)},${(p.y + offsetY).toFixed(4)}`)
        .join(" ");
      if (e.closed) {
        svgElements.push(`    <polygon points="${ptsStr}" />`);
      } else {
        svgElements.push(`    <polyline points="${ptsStr}" />`);
      }
    }
  }
  svgElements.push(`  </g>`);

  // Barra de Verificação de Exatos 100,000 mm com subdivisões a cada 10 mm
  svgElements.push(
    `  <g id="verification-scale-bar-100mm" stroke="#E11D48" stroke-width="0.50" fill="none">`,
    `    <line id="scale-bar-100mm-main" x1="${barStartX.toFixed(3)}" y1="${barY.toFixed(3)}" x2="${barEndX.toFixed(3)}" y2="${barY.toFixed(3)}" data-length-mm="100.000" />`,
  );
  for (let mm = 0; mm <= 100; mm += 10) {
    const tx = barStartX + mm;
    const tickH = mm === 0 || mm === 50 || mm === 100 ? 3.0 : 1.8;
    svgElements.push(
      `    <line x1="${tx.toFixed(3)}" y1="${(barY - tickH).toFixed(3)}" x2="${tx.toFixed(3)}" y2="${(barY + tickH).toFixed(3)}" />`,
    );
  }
  svgElements.push(`  </g>`);

  const instructionsPtBr =
    "PROVA 1:1 CHAMFER CAD — Imprima em escala 100% (sem ajustar à página). Confira a barra de 100,000 mm e as cruzes de canto com o paquímetro e encoste a peça física sobre o papel.";

  svgElements.push(
    `  <g font-family="monospace" font-size="2.8" fill="#0F172A">`,
    `    <text x="${barStartX.toFixed(3)}" y="${(barY - 4.2).toFixed(3)}" font-weight="bold">${partTitle} — BARRA DE VERIFICAÇÃO = 100,000 mm</text>`,
    `    <text x="${barStartX.toFixed(3)}" y="${(barY + 5.5).toFixed(3)}">Cruzes de canto: ΔX = ${cornerCrossSpanXMm.toFixed(3)} mm | ΔY = ${cornerCrossSpanYMm.toFixed(3)} mm</text>`,
    `    <text x="${barStartX.toFixed(3)}" y="${(barY + 9.0).toFixed(3)}">${instructionsPtBr}</text>`,
    `  </g>`,
  );

  const svgContent = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidthMm.toFixed(3)}mm" height="${pageHeightMm.toFixed(3)}mm" viewBox="0 0 ${pageWidthMm.toFixed(3)} ${pageHeightMm.toFixed(3)}">`,
    `  <rect x="0" y="0" width="${pageWidthMm.toFixed(3)}" height="${pageHeightMm.toFixed(3)}" fill="#FFFFFF" />`,
    ...svgElements,
    `</svg>`,
  ].join("\n");

  return {
    pageWidthMm,
    pageHeightMm,
    verificationBarLengthMm,
    verificationBarStart: { x: barStartX, y: barY },
    verificationBarEnd: { x: barEndX, y: barY },
    cornerCrossSpanXMm,
    cornerCrossSpanYMm,
    cornerCrosses,
    svgContent,
    instructionsPtBr,
  };
}

/**
 * Calibração para o modo opcional "Tamanho Real na Tela" usando um cartão padrão ISO/IEC 7810 ID-1
 * (85,60 mm × 53,98 mm). Inclui aviso obrigatório de proteção da tela.
 */
export const ID1_CARD_WIDTH_MM = 85.6;
export const ID1_CARD_HEIGHT_MM = 53.98;

export function computeRealSizeOnScreenById1Card(cardWidthPx: number): {
  cardWidthPx: number;
  pxPerMm: number;
  mmPerPx: number;
  screenDpiEstimate: number;
  safetyWarningPtBr: string;
} {
  const safePx = Math.max(50, cardWidthPx);
  const pxPerMm = safePx / ID1_CARD_WIDTH_MM;
  const mmPerPx = ID1_CARD_WIDTH_MM / safePx;
  const screenDpiEstimate = pxPerMm * 25.4;

  return {
    cardWidthPx: safePx,
    pxPerMm,
    mmPerPx,
    screenDpiEstimate,
    safetyWarningPtBr:
      "AVISO DE PROTEÇÃO DA TELA: Uso indicado apenas para peças pequenas, leves e planas. Proteja o vidro do celular com filme/papel antes de aproximar peças metálicas com rebarbas.",
  };
}

// ============================================================================
// 5. MAPA VISUAL QUALITATIVO DE CONFIANÇA (SEÇÃO 13.4)
// ============================================================================

export type QualitativeConfidenceCategory =
  | "confirmado_medicao"
  | "calculado"
  | "ajustado"
  | "estimado_foto"
  | "provisorio"
  | "nao_determinado";

export interface EntityConfidenceMapEntry {
  entityId: string;
  entityType: Entity["type"];
  infoStatus: RevEngInfoStatus;
  qualitativeCategory: QualitativeConfidenceCategory;
  badgeLabel: string;
  strokeColorHex: string;
  criteriaJustification: string;
}

export interface ConfidenceMapReport {
  entries: EntityConfidenceMapEntry[];
  countsByStatus: Record<RevEngInfoStatus, number>;
  countsByCategory: Record<QualitativeConfidenceCategory, number>;
  allConfirmedOrCalculated: boolean;
  summaryNote: string;
}

export function evaluateConfidenceMap(params: {
  entities: Entity[];
  measurements: MeasurementRecord[];
  regions25D?: RevEngRegion25D[];
  referenceImages?: RevEngReferenceImage[];
}): ConfidenceMapReport {
  const { entities, measurements, regions25D = [] } = params;

  const measByEntity = new Map<string, MeasurementRecord[]>();
  for (const m of measurements) {
    if (m.linkedEntityId) {
      const list = measByEntity.get(m.linkedEntityId) ?? [];
      list.push(m);
      measByEntity.set(m.linkedEntityId, list);
    }
  }

  const regByEntity = new Map<string, RevEngRegion25D>();
  for (const r of regions25D) {
    regByEntity.set(r.entityId, r);
  }

  const countsByStatus: Record<RevEngInfoStatus, number> = {
    MEDIDO: 0,
    CALCULADO: 0,
    AJUSTADO: 0,
    ESTIMADO: 0,
    HIPOTESE: 0,
    NOMINAL_ACEITO: 0,
    DESCONHECIDO: 0,
  };

  const countsByCategory: Record<QualitativeConfidenceCategory, number> = {
    confirmado_medicao: 0,
    calculado: 0,
    ajustado: 0,
    estimado_foto: 0,
    provisorio: 0,
    nao_determinado: 0,
  };

  const entries: EntityConfidenceMapEntry[] = [];

  for (const e of entities) {
    if (e.isConstruction) continue;

    const linkedMeas = measByEntity.get(e.id) ?? [];
    const linkedReg = regByEntity.get(e.id);

    let status: RevEngInfoStatus =
      (e.params?.infoStatus as RevEngInfoStatus | undefined) ??
      (linkedMeas[0]?.infoStatus as RevEngInfoStatus | undefined) ??
      "MEDIDO";

    if (linkedReg?.depthStatus === "DESCONHECIDO") {
      status = "DESCONHECIDO";
    }

    if (!(status in REV_ENG_STATUS_META)) {
      status = "DESCONHECIDO";
    }

    countsByStatus[status]++;
    const meta = REV_ENG_STATUS_META[status];

    let qualitativeCategory: QualitativeConfidenceCategory = "confirmado_medicao";
    let justification = "";

    if (status === "MEDIDO") {
      qualitativeCategory = "confirmado_medicao";
      justification =
        linkedMeas.length > 0
          ? `Confirmado por ${linkedMeas.length} medição(ões) física(s) (${linkedMeas.map((m) => m.code).join(", ")}).`
          : "Confirmado por medição direta de bancada.";
    } else if (status === "CALCULADO") {
      qualitativeCategory = "calculado";
      justification =
        "Derivado analiticamente por geometria exata (trilateração, ponte tangente TTR ou offset).";
    } else if (status === "AJUSTADO") {
      qualitativeCategory = "ajustado";
      const rms = typeof e.params?.fitRmsMm === "number" ? ` (RMS = ${e.params.fitRmsMm.toFixed(3)} mm)` : "";
      justification = `Ajustado por mínimos quadrados ortogonais${rms}.`;
    } else if (status === "ESTIMADO") {
      qualitativeCategory = "estimado_foto";
      justification =
        "Extraído de imagem calibrada ou fatia de malha sem aferição direta por paquímetro.";
    } else if (status === "HIPOTESE" || status === "NOMINAL_ACEITO") {
      qualitativeCategory = "provisorio";
      justification =
        status === "NOMINAL_ACEITO"
          ? "Nominal de projeto aceito explicitamente pelo usuário."
          : "Hipótese de intenção de projeto aguardando confirmação.";
    } else {
      qualitativeCategory = "nao_determinado";
      justification = "Dimensão ou profundidade Z pendente / não determinada.";
    }

    countsByCategory[qualitativeCategory]++;

    entries.push({
      entityId: e.id,
      entityType: e.type,
      infoStatus: status,
      qualitativeCategory,
      badgeLabel: meta.shortLabel,
      strokeColorHex: meta.strokeColor,
      criteriaJustification: justification,
    });
  }

  const allConfirmedOrCalculated =
    entries.length > 0 &&
    countsByCategory.nao_determinado === 0 &&
    countsByCategory.estimado_foto === 0 &&
    countsByStatus.HIPOTESE === 0;

  return {
    entries,
    countsByStatus,
    countsByCategory,
    allConfirmedOrCalculated,
    summaryNote:
      "Classificação qualitativa baseada em critérios objetivos de engenharia (instrumento, resíduos, vínculos e estado de profundidade), sem porcentagens arbitrárias.",
  };
}
