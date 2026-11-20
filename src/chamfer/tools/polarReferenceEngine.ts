/**
 * CALDRA CHAMFER — MOTOR "REF. POLAR" (COTA DE REFERÊNCIA NÃO-VETORIAL)
 *
 * Gabaritagem profissional inspirada em Object Snap / Polar Tracking industrial:
 *  - Estritamente NÃO-VETORIAL: nunca entra em `entities`, nunca gera sólidos 3D,
 *    nunca é exportada para `.DXF` nem `BOM`, nunca interfere em Trim/Fillet/Offset;
 *  - Origem `P_ref` em qualquer borda, extremidade, ponto médio, centro ou DATUM;
 *  - Alvo magnético `P_target` com trava polar (0°, 30°, 45°, 60°, 90°, 120°, 135°, 150°, 180°, ...),
 *    perpendicularidade automática à borda selecionada, ORTO e entrada numérica exata (d, ∠);
 *  - Alvo `P_target` (⊕) entra como SNAP de prioridade máxima para iniciar Círculos, Linhas,
 *    Retângulos, Arcos e Polilinhas diretamente no ponto gabaritado;
 *  - 100% compatível com Undo/Redo, DATUM, Mira 55px e Lupa.
 */

import { dist, segmentsOf, uid, type Entity, type Vec2 } from "@/lib/lab2d/core";

export interface PolarRefOriginAnchor {
  point: Vec2;
  kind: "datum" | "endpoint" | "midpoint" | "center" | "edge" | "free";
  label: string;
  /** Direção unitária da borda (se ancorado em uma aresta) para perpendicularidade automática */
  edgeDir?: Vec2;
  /** Ângulo perpendicular automático à borda (em graus CHAMFER, 0°=+X, 90°=-Y cima) */
  edgePerpAngleDeg?: number;
}

export interface PolarReferenceItem {
  id: string;
  /** Origem da referência P_ref */
  origin: Vec2;
  /** Ponto de gabarito cravado P_target (alvo magnético ⊕) */
  target: Vec2;
  /** Distância exata em mm */
  distanceMm: number;
  /** Ângulo em graus no padrão CHAMFER (0°=+X direita, 90°=-Y cima) */
  angleDeg: number;
  /** Rótulo da origem */
  originLabel: string;
  /** Se está travado perpendicularmente a uma borda */
  isPerpendicularToEdge?: boolean;
  /** Timestamp de criação */
  createdAt: number;
}

export const POLAR_SNAP_ANGLES_DEG = [
  0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330,
] as const;

export function normalizeDeg360(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  if (Math.abs(d - 360) < 1e-6) d = 0;
  return Number(d.toFixed(2));
}

/**
 * Converte vetor (origin -> target) para ângulo CHAMFER em graus
 * (0° = +X direita, 90° = -Y cima, 180° = -X esquerda, 270° = +Y baixo).
 */
export function vectorToChamferAngleDeg(origin: Vec2, target: Vec2): number {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  return normalizeDeg360((Math.atan2(-dy, dx) * 180) / Math.PI);
}

/**
 * Calcula o ponto alvo `P_target` a partir de `origin`, distância `distanceMm` e ângulo CHAMFER `angleDeg`.
 */
export function computePolarTargetPoint(
  origin: Vec2,
  distanceMm: number,
  angleDeg: number,
): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const safeDist = Math.max(0, distanceMm);
  return {
    x: Number((origin.x + Math.cos(rad) * safeDist).toFixed(4)),
    y: Number((origin.y - Math.sin(rad) * safeDist).toFixed(4)),
  };
}

/**
 * Detecta o melhor ponto de origem `P_ref` sob o cursor/Mira:
 * prioridade para DATUM, extremidades, pontos médios, centros de círculo/arco,
 * ou projeção sobre uma borda (fornecendo automaticamente o ângulo perpendicular à borda!).
 */
export function detectPolarRefOrigin(
  point: Vec2,
  entities: Entity[],
  tolMm: number,
  datumOrigin?: Vec2 | null,
): PolarRefOriginAnchor {
  // 1. DATUM ativo tem prioridade se próximo
  if (datumOrigin && dist(point, datumOrigin) <= tolMm * 1.4) {
    return {
      point: { x: datumOrigin.x, y: datumOrigin.y },
      kind: "datum",
      label: "DATUM [0,0]",
    };
  }

  let bestNode: { pt: Vec2; d: number; kind: PolarRefOriginAnchor["kind"]; label: string; edgeDir?: Vec2 } | null = null;
  const considerNode = (
    pt: Vec2,
    kind: PolarRefOriginAnchor["kind"],
    label: string,
    bias = 1,
    edgeDir?: Vec2,
  ) => {
    const d = dist(point, pt) * bias;
    if (dist(point, pt) <= tolMm * 1.25 && (!bestNode || d < bestNode.d)) {
      bestNode = { pt, d, kind, label, edgeDir };
    }
  };

  for (const e of entities) {
    if (!e || e.type === "text" || e.type === "hatch") continue;
    if (e.type === "circle" || e.type === "arc") {
      considerNode({ x: e.cx, y: e.cy }, "center", "Centro", 0.9);
      if (e.type === "arc") {
        considerNode(
          { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) },
          "endpoint",
          "Extremidade",
          0.95,
        );
        considerNode(
          { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) },
          "endpoint",
          "Extremidade",
          0.95,
        );
      }
      continue;
    }
    if (e.type === "point") {
      considerNode({ x: e.x, y: e.y }, "endpoint", "Ponto", 0.9);
      continue;
    }
    const segs = segmentsOf(e);
    for (const [a, b] of segs) {
      const segLen = dist(a, b);
      if (segLen < 1e-4) continue;
      const edgeDir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
      considerNode(a, "endpoint", "Vértice", 0.9, edgeDir);
      considerNode(b, "endpoint", "Vértice", 0.9, edgeDir);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      considerNode(mid, "midpoint", "Ponto Médio", 0.92, edgeDir);
    }
  }

  if (bestNode) {
    const bn = bestNode as {
      pt: Vec2;
      d: number;
      kind: PolarRefOriginAnchor["kind"];
      label: string;
      edgeDir?: Vec2;
    };
    let edgePerpAngleDeg: number | undefined;
    if (bn.edgeDir) {
      const edgeAng = normalizeDeg360((Math.atan2(-bn.edgeDir.y, bn.edgeDir.x) * 180) / Math.PI);
      edgePerpAngleDeg = normalizeDeg360(edgeAng + 90);
    }
    return {
      point: bn.pt,
      kind: bn.kind,
      label: bn.label,
      edgeDir: bn.edgeDir,
      edgePerpAngleDeg,
    };
  }

  // 2. Projeção deslizante ao longo da borda mais próxima (perpendicularidade automática)
  let bestEdge: { pt: Vec2; d: number; dir: Vec2 } | null = null;
  for (const e of entities) {
    if (!e || e.type === "text" || e.type === "hatch" || e.type === "point") continue;
    for (const [a, b] of segmentsOf(e)) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / l2));
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      const d = dist(point, proj);
      if (d <= tolMm * 1.4 && (!bestEdge || d < bestEdge.d)) {
        const len = Math.sqrt(l2);
        bestEdge = { pt: proj, d, dir: { x: dx / len, y: dy / len } };
      }
    }
  }

  if (bestEdge) {
    const edgeAng = normalizeDeg360((Math.atan2(-bestEdge.dir.y, bestEdge.dir.x) * 180) / Math.PI);
    return {
      point: bestEdge.pt,
      kind: "edge",
      label: "Borda",
      edgeDir: bestEdge.dir,
      edgePerpAngleDeg: normalizeDeg360(edgeAng + 90),
    };
  }

  return {
    point: { x: point.x, y: point.y },
    kind: "free",
    label: "Ponto Livre",
  };
}

/**
 * Avalia o ponto alvo ao vivo para `Ref. Polar` aplicando:
 *  - Ângulo travado manualmente (`lockedAngleDeg`), OU
 *  - Modo `ORTO` (0°/90°/180°/270°), OU
 *  - Perpendicularidade automática à borda selecionada (dentro de 6°), OU
 *  - Snaps polares padrão (0°, 30°, 45°, 60°, 90°, 120°, 135°, 150°, 180°... dentro de 4.5°).
 */
export function evaluateLivePolarReference(params: {
  originAnchor: PolarRefOriginAnchor;
  rawCursor: Vec2;
  orthoOn: boolean;
  polarSnapOn: boolean;
  lockedDistanceMm?: number | null;
  lockedAngleDeg?: number | null;
}): {
  target: Vec2;
  distanceMm: number;
  angleDeg: number;
  snappedAngleLabel: string | null;
  isPerpendicularToEdge: boolean;
} {
  const { originAnchor, rawCursor, orthoOn, polarSnapOn, lockedDistanceMm, lockedAngleDeg } = params;
  const origin = originAnchor.point;
  const rawDist = dist(origin, rawCursor);
  const rawAng = vectorToChamferAngleDeg(origin, rawCursor);

  let effAngle = rawAng;
  let snappedAngleLabel: string | null = null;
  let isPerp = false;

  const angleDiff = (a: number, b: number) => {
    const d = Math.abs(normalizeDeg360(a) - normalizeDeg360(b));
    return Math.min(d, 360 - d);
  };

  if (typeof lockedAngleDeg === "number" && Number.isFinite(lockedAngleDeg)) {
    effAngle = normalizeDeg360(lockedAngleDeg);
    snappedAngleLabel = `🔒 ${effAngle.toFixed(1)}°`;
  } else if (orthoOn) {
    const orthoAngles = [0, 90, 180, 270];
    let best = 0;
    let bestD = Infinity;
    for (const oa of orthoAngles) {
      const d = angleDiff(rawAng, oa);
      if (d < bestD) {
        bestD = d;
        best = oa;
      }
    }
    effAngle = best;
    snappedAngleLabel = `ORTO ${best}°`;
  } else {
    // Perpendicularidade automática à borda (nos dois sentidos: +90° e -90°)
    if (originAnchor.edgePerpAngleDeg !== undefined) {
      const perp1 = normalizeDeg360(originAnchor.edgePerpAngleDeg);
      const perp2 = normalizeDeg360(originAnchor.edgePerpAngleDeg + 180);
      if (angleDiff(rawAng, perp1) <= 6) {
        effAngle = perp1;
        snappedAngleLabel = `⊥ ${perp1.toFixed(0)}°`;
        isPerp = true;
      } else if (angleDiff(rawAng, perp2) <= 6) {
        effAngle = perp2;
        snappedAngleLabel = `⊥ ${perp2.toFixed(0)}°`;
        isPerp = true;
      }
    }

    if (!isPerp && polarSnapOn) {
      for (const snapDeg of POLAR_SNAP_ANGLES_DEG) {
        if (angleDiff(rawAng, snapDeg) <= 4.5) {
          effAngle = snapDeg;
          snappedAngleLabel = `${snapDeg}°`;
          break;
        }
      }
    }
  }

  const effDist =
    typeof lockedDistanceMm === "number" && Number.isFinite(lockedDistanceMm) && lockedDistanceMm >= 0
      ? lockedDistanceMm
      : Number(rawDist.toFixed(2));

  const target = computePolarTargetPoint(origin, effDist, effAngle);
  return {
    target,
    distanceMm: Number(effDist.toFixed(2)),
    angleDeg: normalizeDeg360(effAngle),
    snappedAngleLabel,
    isPerpendicularToEdge: isPerp,
  };
}

/**
 * Cria um item de `Ref. Polar` definitivo (estritamente não-vetorial).
 */
export function createPolarReferenceItem(params: {
  origin: Vec2;
  distanceMm: number;
  angleDeg: number;
  originLabel?: string;
  isPerpendicularToEdge?: boolean;
}): PolarReferenceItem {
  const safeDist = Math.max(0.01, Number(params.distanceMm.toFixed(3)));
  const safeAng = normalizeDeg360(params.angleDeg);
  const target = computePolarTargetPoint(params.origin, safeDist, safeAng);
  return {
    id: `pref-${uid()}`,
    origin: { x: params.origin.x, y: params.origin.y },
    target,
    distanceMm: safeDist,
    angleDeg: safeAng,
    originLabel: params.originLabel ?? "Ref.",
    isPerpendicularToEdge: params.isPerpendicularToEdge,
    createdAt: Date.now(),
  };
}

/**
 * Procura o alvo magnético `⊕` (`P_target`) mais próximo entre todas as referências polares ativas.
 * Prioridade máxima no motor de SNAP do CHAMFER CAD.
 */
export function findNearestPolarRefSnap(
  point: Vec2,
  polarRefs: PolarReferenceItem[],
  tolMm: number,
): { point: Vec2; refItem: PolarReferenceItem; kind: "target" | "origin"; distance: number } | null {
  let best: {
    point: Vec2;
    refItem: PolarReferenceItem;
    kind: "target" | "origin";
    distance: number;
  } | null = null;

  for (const item of polarRefs) {
    const dt = dist(point, item.target);
    if (dt <= tolMm && (!best || dt < best.distance)) {
      best = { point: { ...item.target }, refItem: item, kind: "target", distance: dt };
    }
    const doDist = dist(point, item.origin);
    if (doDist <= tolMm * 0.85 && (!best || doDist < best.distance)) {
      best = { point: { ...item.origin }, refItem: item, kind: "origin", distance: doDist };
    }
  }
  return best;
}

/**
 * Calcula geometria simétrica para Linha / Polilinha no modo "Centro-Raio":
 * dado o ponto central `center` e o ponto final do raio `edgePt`, retorna
 * `start`, `end`, `radiusMm` (meia-largura), `lengthMm` (2 * R) e `angleDeg`.
 */
export function computeCenterRadiusLineGeometry(
  center: Vec2,
  edgePt: Vec2,
): {
  center: Vec2;
  start: Vec2;
  end: Vec2;
  radiusMm: number;
  lengthMm: number;
  angleDeg: number;
} {
  const vx = edgePt.x - center.x;
  const vy = edgePt.y - center.y;
  const r = Math.hypot(vx, vy);
  const start: Vec2 = { x: center.x - vx, y: center.y - vy };
  const end: Vec2 = { x: center.x + vx, y: center.y + vy };
  const angleDeg = r < 1e-9 ? 0 : normalizeDeg360((Math.atan2(-vy, vx) * 180) / Math.PI);
  return {
    center: { x: center.x, y: center.y },
    start,
    end,
    radiusMm: Number(r.toFixed(3)),
    lengthMm: Number((r * 2).toFixed(3)),
    angleDeg,
  };
}

/**
 * Reconstrói a linha simétrica a partir do centro imóvel `center`, `radiusMm` (ou `lengthMm / 2`) e `angleDeg`.
 */
export function buildCenterRadiusLineFromParams(
  center: Vec2,
  radiusMm: number,
  angleDeg: number,
): {
  center: Vec2;
  start: Vec2;
  end: Vec2;
  radiusMm: number;
  lengthMm: number;
  angleDeg: number;
} {
  const safeR = Math.max(0.05, radiusMm);
  const safeAng = normalizeDeg360(angleDeg);
  const rad = (safeAng * Math.PI) / 180;
  const vx = Math.cos(rad) * safeR;
  const vy = -Math.sin(rad) * safeR;
  return {
    center: { x: center.x, y: center.y },
    start: { x: Number((center.x - vx).toFixed(4)), y: Number((center.y - vy).toFixed(4)) },
    end: { x: Number((center.x + vx).toFixed(4)), y: Number((center.y + vy).toFixed(4)) },
    radiusMm: Number(safeR.toFixed(3)),
    lengthMm: Number((safeR * 2).toFixed(3)),
    angleDeg: safeAng,
  };
}
