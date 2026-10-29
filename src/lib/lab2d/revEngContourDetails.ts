/**
 * CALDRA CHAMFER CAD — ENGENHARIA REVERSA E BANCADA MECÂNICA (FASE D)
 * Motor Matemático de Contorno e Detalhes:
 *  1. Sugestor de Intenção de Projeto (Seção 12) — Sem mutação silenciosa
 *  2. Gabarito de Raio Virtual / Virtual Radius Gauge (Seção 11.3)
 *  3. Detector de Padrões: Círculo de Furação (PCD), Grade Linear e Simetria Axial (Seção 11.6 / T13)
 *  4. Cavidade de Parede Constante — Auto-Pocket 2D com Colar de Ilhas (Seção 9 / T10)
 *  5. Cremalheira Linear, Serrilhado e Engrenagem Cilíndrica ISO 54 com Involuta Real (Seção 10 / T11)
 */

import type { Entity, LayerId, Vec2 } from "./core";
import { fitOrthogonalCircleOrArc } from "./revEngFitting";
import type { RevEngInfoStatus } from "./revEngTypes";

// ============================================================================
// 1. SUGESTOR DE INTENÇÃO DE PROJETO (SEÇÃO 12)
// ============================================================================

export type DesignIntentKind =
  | "nominal_radius"
  | "nominal_diameter"
  | "notable_angle"
  | "concentricity"
  | "parallel_ortho"
  | "axial_symmetry";

export interface DesignIntentSuggestion {
  id: string;
  kind: DesignIntentKind;
  entityId: string;
  secondaryEntityId?: string;
  title: string;
  description: string;
  measuredValue: number;
  suggestedNominalValue: number;
  deltaValue: number;
  unit: "mm" | "°";
  confidence: "alta" | "media";
  infoStatus: RevEngInfoStatus;
}

/** Série de raios nominais mecânicos preferenciais (ISO / oficina, em mm) */
export const STANDARD_RADIUS_GAUGE_SERIES_MM: number[] = [
  1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
  11, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 25, 26, 28, 30, 32, 35,
  36, 38, 40, 42, 45, 48, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120,
  125, 130, 140, 150, 160, 180, 200, 220, 250, 300,
];

/** Diâmetros comerciais comuns: furos de passagem métricos ISO, brocas de pré-furo de rosca e furos redondos */
export const COMMERCIAL_HOLE_DIAMETERS_MM: Array<{ d: number; note: string }> = [
  { d: 2.5, note: "Pré-furo rosca M3" },
  { d: 3.0, note: "Furo nominal Ø3" },
  { d: 3.2, note: "Rebite 1/8\" / Passagem M3 justa" },
  { d: 3.3, note: "Pré-furo rosca M4" },
  { d: 3.4, note: "Passagem M3 (ISO média)" },
  { d: 4.0, note: "Furo nominal Ø4" },
  { d: 4.2, note: "Pré-furo rosca M5" },
  { d: 4.5, note: "Passagem M4 (ISO média)" },
  { d: 5.0, note: "Pré-furo rosca M6 / Ø5" },
  { d: 5.5, note: "Passagem M5 (ISO média)" },
  { d: 6.0, note: "Furo nominal Ø6" },
  { d: 6.6, note: "Passagem M6 (ISO média)" },
  { d: 6.8, note: "Pré-furo rosca M8" },
  { d: 8.0, note: "Furo nominal Ø8" },
  { d: 8.5, note: "Pré-furo rosca M10" },
  { d: 9.0, note: "Passagem M8 (ISO média)" },
  { d: 10.0, note: "Furo nominal Ø10" },
  { d: 10.2, note: "Pré-furo rosca M12" },
  { d: 11.0, note: "Passagem M10 (ISO média)" },
  { d: 12.0, note: "Furo nominal Ø12" },
  { d: 13.0, note: "Passagem 1/2\" / Ø13" },
  { d: 13.5, note: "Passagem M12 (ISO média)" },
  { d: 14.0, note: "Pré-furo rosca M16 / Ø14" },
  { d: 15.0, note: "Furo nominal Ø15" },
  { d: 16.0, note: "Furo nominal Ø16" },
  { d: 17.5, note: "Passagem M16 (ISO média)" },
  { d: 18.0, note: "Furo nominal Ø18" },
  { d: 20.0, note: "Furo nominal Ø20" },
  { d: 22.0, note: "Passagem M20 (ISO média)" },
  { d: 25.0, note: "Furo nominal Ø25" },
  { d: 30.0, note: "Furo nominal Ø30" },
  { d: 32.0, note: "Furo nominal Ø32" },
  { d: 35.0, note: "Alojamento rolamento Ø35" },
  { d: 40.0, note: "Furo nominal Ø40" },
  { d: 47.0, note: "Alojamento rolamento Ø47" },
  { d: 50.0, note: "Furo nominal Ø50" },
  { d: 60.0, note: "Furo nominal Ø60" },
  { d: 80.0, note: "Furo nominal Ø80" },
  { d: 100.0, note: "Furo nominal Ø100" },
];

const NOTABLE_ANGLES_DEG = [
  0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, -15, -30, -45, -60, -75, -90, -120, -135, -150, -180,
];

function findNearestNominalRadius(r: number): { nominal: number; delta: number } {
  let best = Math.round(r);
  let minAbs = Math.abs(best - r);
  for (const cand of STANDARD_RADIUS_GAUGE_SERIES_MM) {
    const diff = Math.abs(cand - r);
    if (diff < minAbs) {
      minAbs = diff;
      best = cand;
    }
  }
  return { nominal: best, delta: best - r };
}

function findNearestCommercialDiameter(d: number): { nominal: number; delta: number; note: string } {
  let best = Math.round(d);
  let bestNote = `Diâmetro inteiro Ø${best} mm`;
  let minAbs = Math.abs(best - d);

  for (const item of COMMERCIAL_HOLE_DIAMETERS_MM) {
    const diff = Math.abs(item.d - d);
    if (diff < minAbs - 1e-6) {
      minAbs = diff;
      best = item.d;
      bestNote = item.note;
    }
  }
  return { nominal: best, delta: best - d, note: bestNote };
}

/**
 * Inspeciona entidades CAD sem alterá-las e retorna hipóteses de intenção de projeto (Seção 12).
 * Regra crítica: NUNCA altera entidades automaticamente.
 */
export function analyzeDesignIntentSuggestions(
  entities: Entity[],
  options?: {
    maxRadiusDeltaMm?: number;
    maxDiameterDeltaMm?: number;
    maxAngleDeltaDeg?: number;
    maxConcentricDeltaMm?: number;
  },
): DesignIntentSuggestion[] {
  const maxRDelta = options?.maxRadiusDeltaMm ?? 0.6;
  const maxDDelta = options?.maxDiameterDeltaMm ?? 0.5;
  const maxAngDelta = options?.maxAngleDeltaDeg ?? 1.5;
  const maxConcDelta = options?.maxConcentricDeltaMm ?? 0.8;

  const suggestions: DesignIntentSuggestion[] = [];

  for (const ent of entities) {
    const rejectedList = Array.isArray(ent.params?.rejectedSuggestionIds)
      ? (ent.params?.rejectedSuggestionIds as string[])
      : [];

    // 1. Arcos -> Sugestão de Raio Nominal (ex.: R = 79,7 mm -> R = 80,0 mm)
    if (ent.type === "arc") {
      const { nominal, delta } = findNearestNominalRadius(ent.r);
      const absDelta = Math.abs(delta);
      const sugId = `sug-rad-${ent.id}-${nominal}`;
      if (absDelta > 0.005 && absDelta <= maxRDelta && !rejectedList.includes(sugId)) {
        const signStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
        suggestions.push({
          id: sugId,
          kind: "nominal_radius",
          entityId: ent.id,
          title: `Sugerir R = ${nominal.toFixed(1)} mm (${signStr} mm)?`,
          description: `Arco medido/ajustado com R = ${ent.r.toFixed(2)} mm está a ${absDelta.toFixed(2)} mm do raio nominal R${nominal}.`,
          measuredValue: ent.r,
          suggestedNominalValue: nominal,
          deltaValue: delta,
          unit: "mm",
          confidence: absDelta <= 0.35 ? "alta" : "media",
          infoStatus: "HIPOTESE",
        });
      }
    }

    // 2. Círculos -> Sugestão de Diâmetro Comercial ou Raio Nominal
    if (ent.type === "circle") {
      const diam = ent.r * 2;
      const { nominal: nomD, delta: deltaD, note } = findNearestCommercialDiameter(diam);
      const absDeltaD = Math.abs(deltaD);
      const sugDiamId = `sug-diam-${ent.id}-${nomD}`;

      if (absDeltaD > 0.005 && absDeltaD <= maxDDelta && !rejectedList.includes(sugDiamId)) {
        const signStr = deltaD >= 0 ? `+${deltaD.toFixed(2)}` : deltaD.toFixed(2);
        suggestions.push({
          id: sugDiamId,
          kind: "nominal_diameter",
          entityId: ent.id,
          title: `Sugerir Ø = ${nomD.toFixed(1)} mm (${signStr} mm)?`,
          description: `Círculo medido Ø${diam.toFixed(2)} mm próximo de ${note} (Ø${nomD.toFixed(1)} mm).`,
          measuredValue: diam,
          suggestedNominalValue: nomD,
          deltaValue: deltaD,
          unit: "mm",
          confidence: absDeltaD <= 0.25 ? "alta" : "media",
          infoStatus: "HIPOTESE",
        });
      } else {
        const { nominal: nomR, delta: deltaR } = findNearestNominalRadius(ent.r);
        const absDeltaR = Math.abs(deltaR);
        const sugRadId = `sug-rad-${ent.id}-${nomR}`;
        if (absDeltaR > 0.005 && absDeltaR <= maxRDelta && !rejectedList.includes(sugRadId)) {
          const signStr = deltaR >= 0 ? `+${deltaR.toFixed(2)}` : deltaR.toFixed(2);
          suggestions.push({
            id: sugRadId,
            kind: "nominal_radius",
            entityId: ent.id,
            title: `Sugerir R = ${nomR.toFixed(1)} mm (${signStr} mm)?`,
            description: `Raio medido R = ${ent.r.toFixed(2)} mm próximo do raio nominal R${nomR}.`,
            measuredValue: ent.r,
            suggestedNominalValue: nomR,
            deltaValue: deltaR,
            unit: "mm",
            confidence: absDeltaR <= 0.35 ? "alta" : "media",
            infoStatus: "HIPOTESE",
          });
        }
      }
    }

    // 3. Linhas -> Sugestão de Ângulo Notável (0°, 30°, 45°, 60°, 90°...)
    if (ent.type === "line") {
      const dx = ent.x2 - ent.x1;
      const dy = ent.y2 - ent.y1;
      const len = Math.hypot(dx, dy);
      if (len > 2) {
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        let bestAng = angleDeg;
        let minAngDiff = Infinity;
        for (const cand of NOTABLE_ANGLES_DEG) {
          const diff = Math.abs(cand - angleDeg);
          if (diff < minAngDiff) {
            minAngDiff = diff;
            bestAng = cand;
          }
        }
        const sugAngId = `sug-ang-${ent.id}-${bestAng}`;
        if (minAngDiff > 0.03 && minAngDiff <= maxAngDelta && !rejectedList.includes(sugAngId)) {
          const delta = bestAng - angleDeg;
          const signStr = delta >= 0 ? `+${delta.toFixed(2)}°` : `${delta.toFixed(2)}°`;
          suggestions.push({
            id: sugAngId,
            kind: "notable_angle",
            entityId: ent.id,
            title: `Alinhar reta para ${bestAng}° (${signStr})?`,
            description: `Inclinação medida ${angleDeg.toFixed(2)}° está a ${minAngDiff.toFixed(2)}° do ângulo notável ${bestAng}°.`,
            measuredValue: angleDeg,
            suggestedNominalValue: bestAng,
            deltaValue: delta,
            unit: "°",
            confidence: minAngDiff <= 0.6 ? "alta" : "media",
            infoStatus: "HIPOTESE",
          });
        }
      }
    }
  }

  // 4. Concentricidade entre pares de círculos/arcos
  const circularEnts = entities.filter(
    (e): e is Extract<Entity, { type: "circle" | "arc" }> =>
      (e.type === "circle" || e.type === "arc") && !e.isConstruction,
  );
  for (let i = 0; i < circularEnts.length; i++) {
    for (let j = i + 1; j < circularEnts.length; j++) {
      const a = circularEnts[i];
      const b = circularEnts[j];
      const distCenters = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const sugConcId = `sug-conc-${a.id}-${b.id}`;
      const rejectedA = Array.isArray(a.params?.rejectedSuggestionIds)
        ? (a.params?.rejectedSuggestionIds as string[])
        : [];
      if (distCenters > 0.01 && distCenters <= maxConcDelta && !rejectedA.includes(sugConcId)) {
        suggestions.push({
          id: sugConcId,
          kind: "concentricity",
          entityId: b.id,
          secondaryEntityId: a.id,
          title: `Tornar concêntrico (Δc = ${distCenters.toFixed(2)} mm)?`,
          description: `Centros diferem em apenas ${distCenters.toFixed(2)} mm. Deseja alinhar o centro ao elemento base?`,
          measuredValue: distCenters,
          suggestedNominalValue: 0,
          deltaValue: -distCenters,
          unit: "mm",
          confidence: distCenters <= 0.4 ? "alta" : "media",
          infoStatus: "HIPOTESE",
        });
      }
    }
  }

  return suggestions;
}

/**
 * Aplica explicitamente uma sugestão de intenção de projeto aceita pelo usuário,
 * gravando `infoStatus: "NOMINAL_ACEITO"` nos metadados da entidade.
 */
export function applyDesignIntentSuggestion(
  entities: Entity[],
  suggestion: DesignIntentSuggestion,
): Entity[] {
  const refEntity = suggestion.secondaryEntityId
    ? entities.find((e) => e.id === suggestion.secondaryEntityId)
    : undefined;

  return entities.map((ent) => {
    if (ent.id !== suggestion.entityId) return ent;

    const nextParams: Record<string, unknown> = {
      ...(ent.params ?? {}),
      infoStatus: "NOMINAL_ACEITO",
      acceptedSuggestionId: suggestion.id,
      measuredBeforeNominal: suggestion.measuredValue,
      nominalAcceptedValue: suggestion.suggestedNominalValue,
    };

    if (suggestion.kind === "nominal_radius" && (ent.type === "arc" || ent.type === "circle")) {
      return {
        ...ent,
        r: suggestion.suggestedNominalValue,
        params: nextParams,
      };
    }

    if (suggestion.kind === "nominal_diameter" && ent.type === "circle") {
      return {
        ...ent,
        r: suggestion.suggestedNominalValue / 2,
        params: nextParams,
      };
    }

    if (suggestion.kind === "notable_angle" && ent.type === "line") {
      const mx = (ent.x1 + ent.x2) / 2;
      const my = (ent.y1 + ent.y2) / 2;
      const halfLen = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1) / 2;
      const rad = (suggestion.suggestedNominalValue * Math.PI) / 180;
      return {
        ...ent,
        x1: mx - halfLen * Math.cos(rad),
        y1: my - halfLen * Math.sin(rad),
        x2: mx + halfLen * Math.cos(rad),
        y2: my + halfLen * Math.sin(rad),
        params: nextParams,
      };
    }

    if (
      suggestion.kind === "concentricity" &&
      (ent.type === "circle" || ent.type === "arc") &&
      refEntity &&
      (refEntity.type === "circle" || refEntity.type === "arc")
    ) {
      return {
        ...ent,
        cx: refEntity.cx,
        cy: refEntity.cy,
        params: nextParams,
      };
    }

    return { ...ent, params: nextParams };
  });
}

/**
 * Rejeita explicitamente uma sugestão, mantendo a geometria medida intacta
 * e marcando `infoStatus: "MEDIDO"`.
 */
export function rejectDesignIntentSuggestion(
  entities: Entity[],
  suggestion: DesignIntentSuggestion,
): Entity[] {
  return entities.map((ent) => {
    if (ent.id !== suggestion.entityId) return ent;
    const prevRejected = Array.isArray(ent.params?.rejectedSuggestionIds)
      ? (ent.params?.rejectedSuggestionIds as string[])
      : [];
    return {
      ...ent,
      params: {
        ...(ent.params ?? {}),
        infoStatus: "MEDIDO",
        rejectedSuggestionIds: [...prevRejected, suggestion.id],
      },
    };
  });
}

// ============================================================================
// 2. GABARITO DE RAIO VIRTUAL / VIRTUAL RADIUS GAUGE (SEÇÃO 11.3)
// ============================================================================

export interface VirtualRadiusGaugeResult {
  radiusMm: number;
  mode: "concavo" | "convexo";
  center: Vec2;
  startAngleRad: number;
  endAngleRad: number;
  rmsErrorMm: number;
  maxDeviationMm: number;
  fittedMeasuredRadiusMm: number;
  deltaRadiusMm: number;
  entityPreview: Entity;
  summaryLabel: string;
}

/**
 * Avalia um gabarito de raio virtual (pente de raios digital R1..R150 mm)
 * sobre pontos capturados ou sobre um canto entre duas retas selecionadas.
 */
export function evaluateVirtualRadiusGauge(params: {
  radiusMm: number;
  mode: "concavo" | "convexo";
  points?: Vec2[];
  cornerLines?: [
    Extract<Entity, { type: "line" }>,
    Extract<Entity, { type: "line" }>,
  ];
  targetLayer?: LayerId;
}): VirtualRadiusGaugeResult {
  const R = Math.max(0.5, params.radiusMm);
  const layer = params.targetLayer ?? "corte";

  // Caso 1: Concordância analítica entre 2 retas de canto com o raio do gabarito
  if (params.cornerLines) {
    const [l1, l2] = params.cornerLines;
    const d1x = l1.x2 - l1.x1;
    const d1y = l1.y2 - l1.y1;
    const d2x = l2.x2 - l2.x1;
    const d2y = l2.y2 - l2.y1;
    const det = d1x * d2y - d1y * d2x;

    if (Math.abs(det) > 1e-6) {
      // Ponto de interseção das retas suporte
      const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / det;
      const ix = l1.x1 + t * d1x;
      const iy = l1.y1 + t * d1y;

      // Vetores unitários apontando para longe do vértice
      const m1x = (l1.x1 + l1.x2) / 2 - ix;
      const m1y = (l1.y1 + l1.y2) / 2 - iy;
      const m2x = (l2.x1 + l2.x2) / 2 - ix;
      const m2y = (l2.y1 + l2.y2) / 2 - iy;
      const u1Len = Math.hypot(m1x, m1y) || 1;
      const u2Len = Math.hypot(m2x, m2y) || 1;
      const u1 = { x: m1x / u1Len, y: m1y / u1Len };
      const u2 = { x: m2x / u2Len, y: m2y / u2Len };

      const bisX = u1.x + u2.x;
      const bisY = u1.y + u2.y;
      const bisLen = Math.hypot(bisX, bisY) || 1;
      const bis = { x: bisX / bisLen, y: bisY / bisLen };

      const dot = Math.max(-0.999, Math.min(0.999, u1.x * u2.x + u1.y * u2.y));
      const halfAngle = Math.acos(dot) / 2;
      const distCenter = R / Math.max(0.05, Math.sin(halfAngle));
      const distTan = R / Math.max(0.05, Math.tan(halfAngle));

      const cx = ix + bis.x * distCenter;
      const cy = iy + bis.y * distCenter;
      const t1 = { x: ix + u1.x * distTan, y: iy + u1.y * distTan };
      const t2 = { x: ix + u2.x * distTan, y: iy + u2.y * distTan };

      let a0 = Math.atan2(t1.y - cy, t1.x - cx);
      let a1 = Math.atan2(t2.y - cy, t2.x - cx);
      let sweep = a1 - a0;
      while (sweep <= -Math.PI) sweep += 2 * Math.PI;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (params.mode === "concavo" && sweep < 0) {
        const tmp = a0;
        a0 = a1;
        a1 = tmp;
      } else if (params.mode === "convexo" && sweep > 0) {
        const tmp = a0;
        a0 = a1;
        a1 = tmp;
      }

      const preview: Entity = {
        id: `reveng-gauge-arc-${Date.now()}`,
        type: "arc",
        layer,
        cx,
        cy,
        r: R,
        a0,
        a1,
        params: {
          infoStatus: "MEDIDO",
          virtualGaugeRadiusMm: R,
          virtualGaugeMode: params.mode,
        },
      };

      return {
        radiusMm: R,
        mode: params.mode,
        center: { x: cx, y: cy },
        startAngleRad: a0,
        endAngleRad: a1,
        rmsErrorMm: 0,
        maxDeviationMm: 0,
        fittedMeasuredRadiusMm: R,
        deltaRadiusMm: 0,
        entityPreview: preview,
        summaryLabel: `Pente de Raio R${R} (${params.mode === "concavo" ? "Côncavo" : "Convexo"})`,
      };
    }
  }

  // Caso 2: Ajuste do gabarito de raio fixo R sobre pontos capturados (ou origem se vazio)
  const pts = params.points && params.points.length >= 3 ? params.points : [];
  if (pts.length >= 3) {
    const freeFit = fitOrthogonalCircleOrArc(pts, false, layer);
    let cx = freeFit.cx;
    let cy = freeFit.cy;
    const fittedR = freeFit.r;

    // Ajusta somente o centro (cx, cy) mantendo R = radiusMm fixo (Gauss-Newton 2D)
    for (let iter = 0; iter < 25; iter++) {
      let j11 = 0;
      let j12 = 0;
      let j22 = 0;
      let b1 = 0;
      let b2 = 0;
      for (const p of pts) {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const res = d - R;
        const gx = dx / d;
        const gy = dy / d;
        j11 += gx * gx;
        j12 += gx * gy;
        j22 += gy * gy;
        b1 += gx * res;
        b2 += gy * res;
      }
      const det = j11 * j22 - j12 * j12;
      if (Math.abs(det) < 1e-9) break;
      const dcx = (j22 * b1 - j12 * b2) / det;
      const dcy = (j11 * b2 - j12 * b1) / det;
      cx -= dcx;
      cy -= dcy;
      if (Math.hypot(dcx, dcy) < 1e-6) break;
    }

    let sumSq = 0;
    let maxDev = 0;
    for (const p of pts) {
      const dev = Math.abs(Math.hypot(p.x - cx, p.y - cy) - R);
      sumSq += dev * dev;
      if (dev > maxDev) maxDev = dev;
    }
    const rms = Math.sqrt(sumSq / pts.length);
    const a0 = Math.atan2(pts[0].y - cy, pts[0].x - cx);
    const a1 = Math.atan2(pts[pts.length - 1].y - cy, pts[pts.length - 1].x - cx);

    const preview: Entity = {
      id: `reveng-gauge-arc-${Date.now()}`,
      type: "arc",
      layer,
      cx,
      cy,
      r: R,
      a0,
      a1,
      params: {
        infoStatus: "MEDIDO",
        virtualGaugeRadiusMm: R,
        virtualGaugeMode: params.mode,
        rmsMm: rms,
      },
    };

    return {
      radiusMm: R,
      mode: params.mode,
      center: { x: cx, y: cy },
      startAngleRad: a0,
      endAngleRad: a1,
      rmsErrorMm: rms,
      maxDeviationMm: maxDev,
      fittedMeasuredRadiusMm: fittedR,
      deltaRadiusMm: R - fittedR,
      entityPreview: preview,
      summaryLabel: `Pente R${R} vs R_med=${fittedR.toFixed(2)} mm (RMS ${rms.toFixed(2)} mm)`,
    };
  }

  // Fallback na origem (0,0) como gabarito visual posicionável
  const a0 = params.mode === "concavo" ? 0 : Math.PI;
  const a1 = params.mode === "concavo" ? Math.PI / 2 : (3 * Math.PI) / 2;
  const preview: Entity = {
    id: `reveng-gauge-arc-${Date.now()}`,
    type: "arc",
    layer,
    cx: 0,
    cy: 0,
    r: R,
    a0,
    a1,
    params: {
      infoStatus: "MEDIDO",
      virtualGaugeRadiusMm: R,
      virtualGaugeMode: params.mode,
    },
  };

  return {
    radiusMm: R,
    mode: params.mode,
    center: { x: 0, y: 0 },
    startAngleRad: a0,
    endAngleRad: a1,
    rmsErrorMm: 0,
    maxDeviationMm: 0,
    fittedMeasuredRadiusMm: R,
    deltaRadiusMm: 0,
    entityPreview: preview,
    summaryLabel: `Gabarito de Raio R${R} (${params.mode === "concavo" ? "Côncavo" : "Convexo"})`,
  };
}

// ============================================================================
// 3. DETECTOR DE PADRÕES: PCD CIRCULAR, GRADE LINEAR E SIMETRIA (SEÇÃO 11.6 / T13)
// ============================================================================

export interface HolePatternPCDAnalysis {
  holeCount: number;
  center: Vec2;
  measuredPcdMm: number;
  suggestedNominalPcdMm: number;
  radialRmsMm: number;
  maxRadialErrorMm: number;
  angularStepsDeg: number[];
  meanAngularStepDeg: number;
  nominalAngularStepDeg: number;
  maxAngularDeviationDeg: number;
  isRegularBoltCircle: boolean;
  estimatedFullCount: number;
  missingHoleAnglesDeg: number[];
  averageHoleDiameterMm: number;
  summaryText: string;
}

/**
 * Detecta Círculo de Furação (PCD — Pitch Circle Diameter) a partir de N >= 3 furos/pontos (Teste T13).
 */
export function detectHolePatternsPCD(
  holes: Array<{ id: string; x: number; y: number; r?: number }>,
): HolePatternPCDAnalysis | null {
  if (holes.length < 3) return null;

  const pts = holes.map((h) => ({ x: h.x, y: h.y }));
  const fit = fitOrthogonalCircleOrArc(pts, true, "construcao");

  const cx = fit.cx;
  const cy = fit.cy;
  const radiusPcd = fit.r;
  const measuredPcdMm = radiusPcd * 2;

  // Sugestão de PCD nominal (arredondado para 0.5 mm ou 1 mm inteiro se próximo)
  const roundedInt = Math.round(measuredPcdMm);
  const roundedHalf = Math.round(measuredPcdMm * 2) / 2;
  const suggestedNominalPcdMm =
    Math.abs(measuredPcdMm - roundedInt) <= 0.6 ? roundedInt : roundedHalf;

  // Ordenar furos por ângulo polar em torno de (cx, cy)
  const withAngles = holes
    .map((h) => {
      let deg = (Math.atan2(h.y - cy, h.x - cx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      return { ...h, angleDeg: deg };
    })
    .sort((a, b) => a.angleDeg - b.angleDeg);

  const angularStepsDeg: number[] = [];
  for (let i = 0; i < withAngles.length; i++) {
    const curr = withAngles[i].angleDeg;
    const next =
      i + 1 < withAngles.length ? withAngles[i + 1].angleDeg : withAngles[0].angleDeg + 360;
    angularStepsDeg.push(next - curr);
  }

  // Detectar passo angular base (usando mediana dos passos para tolerar 1 furo faltante)
  const sortedSteps = [...angularStepsDeg].sort((a, b) => a - b);
  const medianStep = sortedSteps[Math.floor(sortedSteps.length / 2)] || 360 / holes.length;
  const estimatedFullCount = Math.max(holes.length, Math.round(360 / medianStep));
  const nominalAngularStepDeg = 360 / estimatedFullCount;

  let maxAngularDeviationDeg = 0;
  const missingHoleAnglesDeg: number[] = [];

  for (let i = 0; i < angularStepsDeg.length; i++) {
    const step = angularStepsDeg[i];
    const mult = Math.round(step / nominalAngularStepDeg);
    if (mult >= 2) {
      // Há furo(s) faltante(s) neste intervalo
      for (let m = 1; m < mult; m++) {
        const missingAng = (withAngles[i].angleDeg + m * nominalAngularStepDeg) % 360;
        missingHoleAnglesDeg.push(missingAng);
      }
    }
    const dev = Math.abs(step - Math.max(1, mult) * nominalAngularStepDeg);
    if (dev > maxAngularDeviationDeg) maxAngularDeviationDeg = dev;
  }

  const avgDiam =
    holes.reduce((acc, h) => acc + (h.r ? h.r * 2 : 10), 0) / Math.max(1, holes.length);

  const isRegularBoltCircle = fit.rmsMm <= 1.2 && maxAngularDeviationDeg <= 3.0;

  return {
    holeCount: holes.length,
    center: { x: cx, y: cy },
    measuredPcdMm,
    suggestedNominalPcdMm,
    radialRmsMm: fit.rmsMm,
    maxRadialErrorMm: fit.maxDeviationMm,
    angularStepsDeg,
    meanAngularStepDeg: 360 / holes.length,
    nominalAngularStepDeg,
    maxAngularDeviationDeg,
    isRegularBoltCircle,
    estimatedFullCount,
    missingHoleAnglesDeg,
    averageHoleDiameterMm: avgDiam,
    summaryText: `${holes.length}× Ø${avgDiam.toFixed(1)} em PCD ${measuredPcdMm.toFixed(2)} mm (Sugestão: PCD ${suggestedNominalPcdMm.toFixed(1)} mm · Passo ${nominalAngularStepDeg.toFixed(1)}°)`,
  };
}

/**
 * Regulariza um Círculo de Furação (PCD) somente sob comando explícito do usuário,
 * posicionando os furos no PCD nominal exato e passo angular constante, além de criar o círculo primitivo PCD.
 */
export function regularizeBoltCirclePCD(params: {
  entities: Entity[];
  holeIds: string[];
  center: Vec2;
  nominalPcdMm: number;
  nominalHoleDiameterMm?: number;
  fillMissingHoles?: boolean;
  targetLayer?: LayerId;
}): Entity[] {
  const targetHoles = params.entities.filter(
    (e): e is Extract<Entity, { type: "circle" }> =>
      e.type === "circle" && params.holeIds.includes(e.id),
  );
  if (targetHoles.length < 3) return params.entities;

  const R = params.nominalPcdMm / 2;
  const cx = params.center.x;
  const cy = params.center.y;

  // Ordenar por ângulo e preservar o ângulo de fase do primeiro furo (arredondado para múltiplo de 0.5° se próximo)
  const sorted = [...targetHoles]
    .map((h) => {
      let deg = (Math.atan2(h.cy - cy, h.cx - cx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      return { hole: h, deg };
    })
    .sort((a, b) => a.deg - b.deg);

  const startDegRaw = sorted[0].deg;
  const startDegSnap = Math.abs(startDegRaw - Math.round(startDegRaw)) <= 1.0
    ? Math.round(startDegRaw)
    : startDegRaw;

  const N = sorted.length;
  const stepDeg = 360 / N;
  const holeRadius = params.nominalHoleDiameterMm
    ? params.nominalHoleDiameterMm / 2
    : sorted[0].hole.r;

  const updatedMap = new Map<string, Entity>();
  sorted.forEach((item, idx) => {
    const angRad = ((startDegSnap + idx * stepDeg) * Math.PI) / 180;
    updatedMap.set(item.hole.id, {
      ...item.hole,
      cx: cx + R * Math.cos(angRad),
      cy: cy + R * Math.sin(angRad),
      r: holeRadius,
      params: {
        ...(item.hole.params ?? {}),
        infoStatus: "NOMINAL_ACEITO",
        pcdMm: params.nominalPcdMm,
        pcdStepDeg: stepDeg,
      },
    });
  });

  const nextEntities = params.entities.map((e) => updatedMap.get(e.id) ?? e);

  // Adicionar círculo de construção do PCD
  const pcdCircle: Entity = {
    id: `reveng-pcd-circle-${Date.now()}`,
    type: "circle",
    layer: "construcao",
    isConstruction: true,
    cx,
    cy,
    r: R,
    params: {
      infoStatus: "NOMINAL_ACEITO",
      featureKind: "pcd_construction_circle",
      pcdMm: params.nominalPcdMm,
    },
  };

  return [...nextEntities, pcdCircle];
}

/**
 * Espelha entidades selecionadas em relação a um eixo de simetria (X = x0, Y = y0 ou reta arbitrária).
 */
export function mirrorEntitiesAcrossAxis(params: {
  entities: Entity[];
  axisMode: "vertical_x" | "horizontal_y";
  axisPositionMm: number;
}): Entity[] {
  const mirrored: Entity[] = [];
  const pos = params.axisPositionMm;
  const reflectPt = (p: Vec2): Vec2 =>
    params.axisMode === "vertical_x"
      ? { x: 2 * pos - p.x, y: p.y }
      : { x: p.x, y: 2 * pos - p.y };

  for (const ent of params.entities) {
    const newId = `${ent.id}-sym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    if (ent.type === "circle") {
      const c = reflectPt({ x: ent.cx, y: ent.cy });
      mirrored.push({
        ...ent,
        id: newId,
        cx: c.x,
        cy: c.y,
        params: { ...(ent.params ?? {}), infoStatus: "CALCULADO", mirroredFromId: ent.id },
      });
    } else if (ent.type === "line") {
      const p1 = reflectPt({ x: ent.x1, y: ent.y1 });
      const p2 = reflectPt({ x: ent.x2, y: ent.y2 });
      mirrored.push({
        ...ent,
        id: newId,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        params: { ...(ent.params ?? {}), infoStatus: "CALCULADO", mirroredFromId: ent.id },
      });
    } else if (ent.type === "arc") {
      const c = reflectPt({ x: ent.cx, y: ent.cy });
      const p0 = reflectPt({
        x: ent.cx + ent.r * Math.cos(ent.a0),
        y: ent.cy + ent.r * Math.sin(ent.a0),
      });
      const p1 = reflectPt({
        x: ent.cx + ent.r * Math.cos(ent.a1),
        y: ent.cy + ent.r * Math.sin(ent.a1),
      });
      mirrored.push({
        ...ent,
        id: newId,
        cx: c.x,
        cy: c.y,
        a0: Math.atan2(p1.y - c.y, p1.x - c.x),
        a1: Math.atan2(p0.y - c.y, p0.x - c.x),
        params: { ...(ent.params ?? {}), infoStatus: "CALCULADO", mirroredFromId: ent.id },
      });
    } else if (ent.type === "polyline") {
      mirrored.push({
        ...ent,
        id: newId,
        pts: ent.pts.map(reflectPt),
        params: { ...(ent.params ?? {}), infoStatus: "CALCULADO", mirroredFromId: ent.id },
      });
    }
  }
  return mirrored;
}

// ============================================================================
// 4. CAVIDADE DE PAREDE CONSTANTE — AUTO-POCKET 2D (SEÇÃO 9 / TESTE T10)
// ============================================================================

export interface AutoPocketIslandHole {
  id: string;
  cx: number;
  cy: number;
  r: number;
  /** Espessura de colar individual opcional; se omitida usa islandCollarThicknessMm global */
  collarThicknessMm?: number;
}

export interface ConstantWallPocketInput {
  /** Polígono fechado externo (sentido anti-horário ou horário) */
  outerPolygon: Vec2[];
  /** Espessura de parede constante a partir da borda externa (t_b em mm) */
  borderWallThicknessMm: number;
  /** Espessura de parede/colar ao redor de furos/ilhas internas (t_i em mm) */
  islandCollarThicknessMm: number;
  /** Raio de arredondamento dos cantos internos vivos da cavidade (r_c em mm) */
  cornerRadiusMm: number;
  /** Furos/ilhas internas que devem ser contornados deixando um colar de parede t_i */
  islands: AutoPocketIslandHole[];
  /** Camada alvo para a cavidade gerada */
  targetLayer?: LayerId;
}

export interface ConstantWallPocketOutput {
  status: "ok" | "subdividida" | "colapso_area" | "erro";
  message: string;
  pocketLoops: Vec2[][];
  entities: Entity[];
  areaMm2: number;
  perimeterMm: number;
  maxEndmillDiameterMm: number;
  minWallRemainingMm: number;
  subPocketCount: number;
  hasSelfIntersection: boolean;
}

function signedPolygonArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    area2 += p1.x * p2.y - p2.x * p1.y;
  }
  return area2 / 2;
}

function polygonPerimeter(pts: Vec2[]): number {
  if (pts.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    perim += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return perim;
}

function ensureCCW(pts: Vec2[]): Vec2[] {
  return signedPolygonArea(pts) < 0 ? [...pts].reverse() : [...pts];
}

/**
 * Calcula o offset interno de um polígono fechado simples por distância `offsetMm` (> 0 para dentro)
 * e arredonda os cantos internos com raio `cornerRadiusMm`.
 */
function offsetPolygonInwardWithFillet(
  outerPts: Vec2[],
  offsetMm: number,
  cornerRadiusMm: number,
): Vec2[] {
  const ccw = ensureCCW(outerPts);
  const n = ccw.length;
  if (n < 3) return [];

  // Offset de cada aresta para a esquerda (interior de um polígono CCW)
  const offsetLines: Array<{ p1: Vec2; p2: Vec2; nx: number; ny: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = -dy / len;
    const ny = dx / len;
    offsetLines.push({
      p1: { x: a.x + nx * offsetMm, y: a.y + ny * offsetMm },
      p2: { x: b.x + nx * offsetMm, y: b.y + ny * offsetMm },
      nx,
      ny,
    });
  }

  const m = offsetLines.length;
  if (m < 3) return [];

  const rawVertices: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const l1 = offsetLines[(i - 1 + m) % m];
    const l2 = offsetLines[i];
    const d1x = l1.p2.x - l1.p1.x;
    const d1y = l1.p2.y - l1.p1.y;
    const d2x = l2.p2.x - l2.p1.x;
    const d2y = l2.p2.y - l2.p1.y;
    const det = d1x * d2y - d1y * d2x;
    if (Math.abs(det) < 1e-8) {
      rawVertices.push({ ...l2.p1 });
    } else {
      const t = ((l2.p1.x - l1.p1.x) * d2y - (l2.p1.y - l1.p1.y) * d2x) / det;
      rawVertices.push({ x: l1.p1.x + t * d1x, y: l1.p1.y + t * d1y });
    }
  }

  // Verificar inversão topológica (quando offset excede metade da menor dimensão)
  if (signedPolygonArea(rawVertices) <= 1e-3) {
    return [];
  }

  const rFillet = Math.max(0, cornerRadiusMm);
  if (rFillet <= 0.05) {
    return rawVertices;
  }

  // Arredondar cada vértice convexo interno com arco de raio rFillet
  const filleted: Vec2[] = [];
  const kCount = rawVertices.length;
  for (let i = 0; i < kCount; i++) {
    const prev = rawVertices[(i - 1 + kCount) % kCount];
    const curr = rawVertices[i];
    const next = rawVertices[(i + 1) % kCount];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1e-4 || len2 < 1e-4) {
      filleted.push(curr);
      continue;
    }

    const u1x = v1x / len1;
    const u1y = v1y / len1;
    const u2x = v2x / len2;
    const u2y = v2y / len2;
    const dot = Math.max(-0.999, Math.min(0.999, u1x * u2x + u1y * u2y));
    const halfAng = Math.acos(dot) / 2;
    const tanDist = rFillet / Math.max(0.05, Math.tan(halfAng));
    const maxAllowedTan = Math.min(len1, len2) * 0.45;
    const actualTan = Math.min(tanDist, maxAllowedTan);
    const actualR = actualTan * Math.tan(halfAng);

    if (actualR < 0.05) {
      filleted.push(curr);
      continue;
    }

    const t1 = { x: curr.x + u1x * actualTan, y: curr.y + u1y * actualTan };
    const t2 = { x: curr.x + u2x * actualTan, y: curr.y + u2y * actualTan };
    const bisX = u1x + u2x;
    const bisY = u1y + u2y;
    const bisLen = Math.hypot(bisX, bisY) || 1;
    const centerDist = actualR / Math.max(0.05, Math.sin(halfAng));
    const cx = curr.x + (bisX / bisLen) * centerDist;
    const cy = curr.y + (bisY / bisLen) * centerDist;

    const aStart = Math.atan2(t1.y - cy, t1.x - cx);
    const aEnd = Math.atan2(t2.y - cy, t2.x - cx);
    let sweep = aEnd - aStart;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;

    const arcSteps = 8;
    for (let s = 0; s <= arcSteps; s++) {
      const ang = aStart + (sweep * s) / arcSteps;
      filleted.push({
        x: cx + actualR * Math.cos(ang),
        y: cy + actualR * Math.sin(ang),
      });
    }
  }

  return filleted;
}

/**
 * Amostra densamente um contorno fechado e aplica a subtração booleana exata dos colares
 * das ilhas circulares $R_{\text{boss},k} = r_k + t_i$, empurrando para dentro os trechos da
 * parede da cavidade que invadem o colar do furo e suavizando a transição com raio $r_c$.
 */
function subtractCircularIslandsFromLoop(
  innerLoop: Vec2[],
  islands: AutoPocketIslandHole[],
  defaultCollarMm: number,
  cornerRadiusMm: number,
): { loops: Vec2[][]; minClearanceMm: number } {
  if (innerLoop.length < 3) return { loops: [], minClearanceMm: 0 };
  if (islands.length === 0) return { loops: [innerLoop], minClearanceMm: Infinity };

  // Reamostrar o contorno em passos finos (~1.0 mm) para recorte suave ao redor dos colares
  const densePts: Vec2[] = [];
  const stepMm = 1.0;
  for (let i = 0; i < innerLoop.length; i++) {
    const p1 = innerLoop[i];
    const p2 = innerLoop[(i + 1) % innerLoop.length];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(segLen / stepMm));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      densePts.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }

  // Centroide aproximado da cavidade para orientar o desvio de colar para dentro da peça
  const centroid = densePts.reduce(
    (acc, p) => ({ x: acc.x + p.x / densePts.length, y: acc.y + p.y / densePts.length }),
    { x: 0, y: 0 },
  );

  const displacedPts = densePts.map((pt) => {
    let x = pt.x;
    let y = pt.y;
    for (const isl of islands) {
      const collar = isl.collarThicknessMm ?? defaultCollarMm;
      const bossR = isl.r + collar;
      const blendR = bossR + Math.max(0, cornerRadiusMm * 0.35);
      const dx = x - isl.cx;
      const dy = y - isl.cy;
      const dist = Math.hypot(dx, dy);

      if (dist < bossR) {
        // Ponto do contorno invadiu o colar do furo -> projetar para a borda externa do colar (em direção ao interior da cavidade)
        const fallbackDx = centroid.x - isl.cx;
        const fallbackDy = centroid.y - isl.cy;
        const fLen = Math.hypot(fallbackDx, fallbackDy) || 1;
        const ux = dist > 1e-5 ? dx / dist : fallbackDx / fLen;
        const uy = dist > 1e-5 ? dy / dist : fallbackDy / fLen;
        x = isl.cx + ux * bossR;
        y = isl.cy + uy * bossR;
      } else if (cornerRadiusMm > 0 && dist < blendR) {
        // Suavização da transição de entrada/saída do colar (raio de concordância r_c)
        const ux = dx / dist;
        const uy = dy / dist;
        const t = (blendR - dist) / (blendR - bossR);
        const push = t * t * (cornerRadiusMm * 0.18);
        x += ux * push;
        y += uy * push;
      }
    }
    return { x, y };
  });

  // Simplificar pontos quase colineares (tolerância 0.08 mm) mantendo fidelidade das curvas
  const cleaned: Vec2[] = [];
  for (let i = 0; i < displacedPts.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = displacedPts[i];
    if (!prev || Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 0.35) {
      cleaned.push(curr);
    }
  }

  // Verificar gargalo estreito entre lados opostos do loop (ex.: colar central quase dividindo a cavidade em 2)
  let minClearanceMm = Infinity;
  const m = cleaned.length;
  const skipIndices = Math.max(6, Math.floor(m * 0.12));
  for (let i = 0; i < m; i++) {
    for (let j = i + skipIndices; j < m - skipIndices; j++) {
      const d = Math.hypot(cleaned[j].x - cleaned[i].x, cleaned[j].y - cleaned[i].y);
      if (d < minClearanceMm) minClearanceMm = d;
    }
  }

  return { loops: [cleaned], minClearanceMm };
}

function checkPolylineSelfIntersection(pts: Vec2[]): boolean {
  const n = pts.length;
  if (n < 4) return false;

  // Para polígonos densos, testar segmentos não adjacentes
  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];

      const d1x = a2.x - a1.x;
      const d1y = a2.y - a1.y;
      const d2x = b2.x - b1.x;
      const d2y = b2.y - b1.y;
      const det = d1x * d2y - d1y * d2x;
      if (Math.abs(det) < 1e-9) continue;

      const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
      const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / det;
      if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Gera uma Cavidade de Parede Constante (Auto-Pocket 2D — Seção 9 e Teste T10):
 *  - Offset interno do contorno externo por `borderWallThicknessMm` (t_b)
 *  - Subtração booleana do colar dos furos/ilhas por `islandCollarThicknessMm` (t_i)
 *  - Arredondamento dos cantos internos vivos com `cornerRadiusMm` (r_c -> fresa máx = 2 * r_c)
 */
export function computeConstantWallPocket(
  input: ConstantWallPocketInput,
): ConstantWallPocketOutput {
  const tb = Math.max(0.1, input.borderWallThicknessMm);
  const ti = Math.max(0.1, input.islandCollarThicknessMm);
  const rc = Math.max(0, input.cornerRadiusMm);
  const layer = input.targetLayer ?? "recorte";

  if (!input.outerPolygon || input.outerPolygon.length < 3) {
    return {
      status: "erro",
      message: "Contorno externo inválido: forneça um contorno fechado com pelo menos 3 vértices.",
      pocketLoops: [],
      entities: [],
      areaMm2: 0,
      perimeterMm: 0,
      maxEndmillDiameterMm: rc * 2,
      minWallRemainingMm: 0,
      subPocketCount: 0,
      hasSelfIntersection: false,
    };
  }

  const innerBase = offsetPolygonInwardWithFillet(input.outerPolygon, tb, rc);
  if (innerBase.length < 3 || Math.abs(signedPolygonArea(innerBase)) < 1.0) {
    return {
      status: "colapso_area",
      message: `A espessura de parede t_b = ${tb.toFixed(2)} mm colapsou a área útil da cavidade para zero.`,
      pocketLoops: [],
      entities: [],
      areaMm2: 0,
      perimeterMm: 0,
      maxEndmillDiameterMm: rc * 2,
      minWallRemainingMm: 0,
      subPocketCount: 0,
      hasSelfIntersection: false,
    };
  }

  const { loops, minClearanceMm } = subtractCircularIslandsFromLoop(
    innerBase,
    input.islands,
    ti,
    rc,
  );

  // Além disso, se alguma ilha estiver totalmente dentro da cavidade (longe da borda),
  // adicionamos o anel de colar interno r_k + t_i como loop de ilha interna da cavidade.
  const allLoops: Vec2[][] = [...loops];
  for (const isl of input.islands) {
    const collar = isl.collarThicknessMm ?? ti;
    const bossR = isl.r + collar;
    // Verificar distância mínima do centro da ilha até o innerBase
    let minDistToWall = Infinity;
    for (const pt of innerBase) {
      const d = Math.hypot(pt.x - isl.cx, pt.y - isl.cy);
      if (d < minDistToWall) minDistToWall = d;
    }
    if (minDistToWall > bossR + 0.5) {
      // Ilha livre no interior da cavidade -> gerar anel de proteção de parede constante
      const ringPts: Vec2[] = [];
      const steps = 36;
      for (let s = 0; s < steps; s++) {
        const ang = (2 * Math.PI * s) / steps;
        ringPts.push({
          x: isl.cx + bossR * Math.cos(ang),
          y: isl.cy + bossR * Math.sin(ang),
        });
      }
      allLoops.push(ringPts);
    }
  }

  const mainLoop = allLoops[0];
  let totalArea = Math.abs(signedPolygonArea(mainLoop));
  for (let k = 1; k < allLoops.length; k++) {
    totalArea -= Math.abs(signedPolygonArea(allLoops[k]));
  }
  totalArea = Math.max(0, totalArea);

  if (totalArea < 1.0) {
    return {
      status: "colapso_area",
      message: "Os colares dos furos consumiram toda a área livre da cavidade.",
      pocketLoops: [],
      entities: [],
      areaMm2: 0,
      perimeterMm: 0,
      maxEndmillDiameterMm: rc * 2,
      minWallRemainingMm: 0,
      subPocketCount: 0,
      hasSelfIntersection: false,
    };
  }

  const perimeter = allLoops.reduce((acc, lp) => acc + polygonPerimeter(lp), 0);
  const hasSelfIntersection = checkPolylineSelfIntersection(mainLoop);
  const isSubdivided = minClearanceMm < Math.max(1.0, rc * 2);
  const subPocketCount = isSubdivided ? 2 : 1;

  const entities: Entity[] = allLoops.map((pts, idx) => ({
    id: `reveng-autopocket-${Date.now()}-${idx}`,
    type: "polyline",
    layer,
    pts,
    closed: true,
    params: {
      infoStatus: "CALCULADO",
      featureKind: idx === 0 ? "auto_pocket_outer" : "auto_pocket_island_collar",
      borderWallThicknessMm: tb,
      islandCollarThicknessMm: ti,
      cornerRadiusMm: rc,
      maxEndmillDiameterMm: rc * 2,
      areaMm2: totalArea,
    },
  }));

  return {
    status: isSubdivided ? "subdividida" : "ok",
    message: isSubdivided
      ? `Atenção: Gargalo estreito (${minClearanceMm.toFixed(2)} mm) menor que Ø fresa (${(rc * 2).toFixed(1)} mm) — cavidade tende a dividir-se em 2 regiões.`
      : `Auto-Pocket gerado: Área ${totalArea.toFixed(1)} mm² · Fresa máx Ø${(rc * 2).toFixed(1)} mm.`,
    pocketLoops: allLoops,
    entities,
    areaMm2: totalArea,
    perimeterMm: perimeter,
    maxEndmillDiameterMm: rc * 2,
    minWallRemainingMm: Number.isFinite(minClearanceMm) ? minClearanceMm : tb,
    subPocketCount,
    hasSelfIntersection,
  };
}

// ============================================================================
// 5. ENGRENAGENS, CREMALHEIRAS, SERRILHADOS E DENTES (SEÇÃO 10 / TESTE T11)
// ============================================================================

/** Série de módulos normalizados ISO 54 (Série I preferencial + Série II comum, em mm) */
export const ISO_54_STANDARD_MODULES: number[] = [
  0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5,
  5.0, 5.5, 6.0, 8.0, 10.0, 12.0, 16.0, 20.0,
];

export interface LinearRackInput {
  /** Número de dentes Z */
  toothCountZ: number;
  /** Passo linear p (mm). Se measuredSpanLkMm e spanTeethK forem informados, p = Lk / k */
  pitchMm: number;
  /** Comprimento medido ao longo de k dentes no paquímetro (opcional) */
  measuredSpanLkMm?: number;
  /** Número de dentes k abrangidos pela medição Lk (opcional) */
  spanTeethK?: number;
  /** Altura total do dente h (mm) */
  toothHeightMm: number;
  /** Semi-ângulo de flanco / pressão α em graus (ex.: 20° para cremalheira padrão, 30° para serrilhado) */
  pressureAngleDeg: number;
  /** Largura plana no topo do dente (mm). Se omitida, usa padrão trapezoidal 0.35 * p */
  topLandMm?: number;
  /** Altura do corpo de base sob o fundo dos dentes (mm) */
  baseHeightMm: number;
  /** Raio de concordância na raiz do dente r_f (mm) */
  rootFilletRadiusMm?: number;
  /** Ponto de origem inferior esquerdo (x0, y0) */
  origin?: Vec2;
  /** Camada alvo */
  targetLayer?: LayerId;
}

export interface LinearRackOutput {
  toothCountZ: number;
  effectivePitchMm: number;
  exactTotalLengthMm: number;
  toothHeightMm: number;
  topLandMm: number;
  bottomLandMm: number;
  flankRunMm: number;
  pts: Vec2[];
  entity: Extract<Entity, { type: "polyline" }>;
  hasSelfIntersection: boolean;
}

/**
 * Gera uma Cremalheira Linear ou Barra Serrilhada paramétrica (Seção 10.1 / Teste T11a).
 * Garante comprimento total exato L = Z * p e Z ciclos contínuos de dentes sem auto-interseção.
 */
export function generateLinearRackProfile(input: LinearRackInput): LinearRackOutput {
  const Z = Math.max(1, Math.round(input.toothCountZ));
  const p =
    input.measuredSpanLkMm && input.spanTeethK && input.spanTeethK > 0
      ? input.measuredSpanLkMm / input.spanTeethK
      : Math.max(0.5, input.pitchMm);

  const h = Math.max(0.2, input.toothHeightMm);
  const alphaRad = (Math.max(0, Math.min(40, input.pressureAngleDeg)) * Math.PI) / 180;
  const baseH = Math.max(1.0, input.baseHeightMm);
  const x0 = input.origin?.x ?? 0;
  const y0 = input.origin?.y ?? 0;

  // Projeção horizontal de cada rampa de flanco
  const maxFlankRun = p * 0.42;
  const flankRunMm = Math.min(maxFlankRun, h * Math.tan(alphaRad));
  const defaultTop = Math.max(p * 0.12, p / 2 - flankRunMm);
  const topLandMm = Math.min(p - 2 * flankRunMm - p * 0.05, input.topLandMm ?? defaultTop);
  const bottomLandMm = Math.max(0, p - 2 * flankRunMm - topLandMm);

  const exactTotalLengthMm = Z * p;
  const yRoot = y0 + baseH;
  const yTip = y0 + baseH + h;

  const pts: Vec2[] = [];
  // Canto inferior esquerdo da barra da cremalheira
  pts.push({ x: x0, y: y0 });
  // Subida até a raiz inicial do 1º dente
  pts.push({ x: x0, y: yRoot });

  for (let i = 0; i < Z; i++) {
    const cycleStartX = x0 + i * p;
    const xRiseStart = cycleStartX + bottomLandMm / 2;
    const xTipStart = xRiseStart + flankRunMm;
    const xTipEnd = xTipStart + topLandMm;
    const xFallEnd = xTipEnd + flankRunMm;
    const cycleEndX = cycleStartX + p;

    if (bottomLandMm > 1e-4 && i > 0) {
      pts.push({ x: xRiseStart, y: yRoot });
    } else if (bottomLandMm > 1e-4 && i === 0) {
      pts.push({ x: xRiseStart, y: yRoot });
    }
    pts.push({ x: xTipStart, y: yTip });
    pts.push({ x: xTipEnd, y: yTip });
    pts.push({ x: xFallEnd, y: yRoot });
    if (bottomLandMm > 1e-4) {
      pts.push({ x: cycleEndX, y: yRoot });
    }
  }

  // Canto inferior direito para fechar exatamente em x0 + Z * p
  pts.push({ x: x0 + exactTotalLengthMm, y: y0 });

  const entity: Extract<Entity, { type: "polyline" }> = {
    id: `reveng-rack-${Date.now()}`,
    type: "polyline",
    layer: input.targetLayer ?? "corte",
    pts,
    closed: true,
    params: {
      infoStatus: "CALCULADO",
      featureKind: "linear_rack",
      toothCountZ: Z,
      pitchMm: p,
      exactTotalLengthMm,
      toothHeightMm: h,
      pressureAngleDeg: input.pressureAngleDeg,
    },
  };

  return {
    toothCountZ: Z,
    effectivePitchMm: p,
    exactTotalLengthMm,
    toothHeightMm: h,
    topLandMm,
    bottomLandMm,
    flankRunMm,
    pts,
    entity,
    hasSelfIntersection: false,
  };
}

export interface SpurGearEstimationResult {
  toothCountZ: number;
  measuredOuterDiameterMm: number;
  estimatedModuleMm: number;
  suggestedIsoModuleMm: number;
  moduleDeviationMm: number;
  pressureAngleDeg: number;
  pitchDiameterMm: number;
  baseDiameterMm: number;
  theoreticalOuterDiameterMm: number;
  rootDiameterMm: number;
  circularPitchMm: number;
  toothThicknessPitchMm: number;
  wildhaberSpanTeethK: number;
  wildhaberSpanLengthWkMm: number;
}

/**
 * Estima o módulo ISO 54 e todas as dimensões fundamentais de uma engrenagem cilíndrica de dentes retos
 * a partir do número de dentes Z e do diâmetro externo De medido no paquímetro (Seção 10.2 / Teste T11b).
 *
 * Fórmula de bancada: m_est = De / (Z + 2)
 */
export function estimateGearModuleFromMeasurement(params: {
  toothCountZ: number;
  measuredOuterDiameterMm: number;
  pressureAngleDeg?: number;
  overrideModuleMm?: number;
}): SpurGearEstimationResult {
  const Z = Math.max(6, Math.round(params.toothCountZ));
  const De = Math.max(5, params.measuredOuterDiameterMm);
  const alphaDeg = params.pressureAngleDeg ?? 20;
  const alphaRad = (alphaDeg * Math.PI) / 180;

  const estimatedModuleMm = De / (Z + 2);

  let suggestedIsoModuleMm = ISO_54_STANDARD_MODULES[0];
  let minDiff = Math.abs(estimatedModuleMm - suggestedIsoModuleMm);
  for (const mod of ISO_54_STANDARD_MODULES) {
    const diff = Math.abs(estimatedModuleMm - mod);
    if (diff < minDiff) {
      minDiff = diff;
      suggestedIsoModuleMm = mod;
    }
  }

  const m = params.overrideModuleMm ?? suggestedIsoModuleMm;
  const pitchDiameterMm = m * Z;
  const baseDiameterMm = pitchDiameterMm * Math.cos(alphaRad);
  const theoreticalOuterDiameterMm = m * (Z + 2);
  const rootDiameterMm = m * (Z - 2.5);
  const circularPitchMm = Math.PI * m;
  const toothThicknessPitchMm = circularPitchMm / 2;

  // Medida Wildhaber W_k sobre k dentes para conferência direta com o paquímetro nos flancos
  const invAlpha = Math.tan(alphaRad) - alphaRad;
  const wildhaberSpanTeethK = Math.max(2, Math.round((Z * alphaRad) / Math.PI + 0.5));
  const wildhaberSpanLengthWkMm =
    m * Math.cos(alphaRad) * (Math.PI * (wildhaberSpanTeethK - 0.5) + Z * invAlpha);

  return {
    toothCountZ: Z,
    measuredOuterDiameterMm: De,
    estimatedModuleMm,
    suggestedIsoModuleMm,
    moduleDeviationMm: estimatedModuleMm - suggestedIsoModuleMm,
    pressureAngleDeg: alphaDeg,
    pitchDiameterMm,
    baseDiameterMm,
    theoreticalOuterDiameterMm,
    rootDiameterMm,
    circularPitchMm,
    toothThicknessPitchMm,
    wildhaberSpanTeethK,
    wildhaberSpanLengthWkMm,
  };
}

/**
 * Gera o perfil fechado com curva involuta real dos Z dentes da engrenagem,
 * acompanhado do círculo primitivo (construção) e furo central opcional.
 */
export function generateSpurGearProfile(params: {
  toothCountZ: number;
  moduleMm: number;
  pressureAngleDeg?: number;
  centerBoreDiameterMm?: number;
  center?: Vec2;
  targetLayer?: LayerId;
}): {
  estimation: SpurGearEstimationResult;
  outerGearEntity: Extract<Entity, { type: "polyline" }>;
  pitchCircleEntity: Extract<Entity, { type: "circle" }>;
  boreEntity?: Extract<Entity, { type: "circle" }>;
  allEntities: Entity[];
} {
  const Z = Math.max(6, Math.round(params.toothCountZ));
  const m = Math.max(0.3, params.moduleMm);
  const alphaDeg = params.pressureAngleDeg ?? 20;
  const cx = params.center?.x ?? 0;
  const cy = params.center?.y ?? 0;

  const estimation = estimateGearModuleFromMeasurement({
    toothCountZ: Z,
    measuredOuterDiameterMm: m * (Z + 2),
    pressureAngleDeg: alphaDeg,
    overrideModuleMm: m,
  });

  const Rp = estimation.pitchDiameterMm / 2;
  const Rb = estimation.baseDiameterMm / 2;
  const Ra = estimation.theoreticalOuterDiameterMm / 2;
  const Rf = Math.max(0.5, estimation.rootDiameterMm / 2);

  const alphaRad = (alphaDeg * Math.PI) / 180;
  const invAlpha = Math.tan(alphaRad) - alphaRad;
  // Semi-espessura angular do dente no círculo de base
  const halfBaseAngle = Math.PI / (2 * Z) + invAlpha;

  const pts: Vec2[] = [];
  const involuteSamples = 6;
  const rStart = Math.max(Rf, Rb);

  for (let i = 0; i < Z; i++) {
    const toothCenterAngle = (2 * Math.PI * i) / Z;
    const nextToothCenterAngle = (2 * Math.PI * (i + 1)) / Z;

    // Ponto de raiz esquerda
    const leftBaseAngle = toothCenterAngle - halfBaseAngle;
    if (Rf < Rb) {
      pts.push({
        x: cx + Rf * Math.cos(leftBaseAngle),
        y: cy + Rf * Math.sin(leftBaseAngle),
      });
    }

    // Flanco esquerdo (involuta ascendente de rStart até Ra)
    for (let s = 0; s <= involuteSamples; s++) {
      const r = rStart + ((Ra - rStart) * s) / involuteSamples;
      const phi = Math.acos(Math.min(1, Rb / r));
      const invPhi = Math.tan(phi) - phi;
      const ang = toothCenterAngle - (halfBaseAngle - invPhi);
      pts.push({
        x: cx + r * Math.cos(ang),
        y: cy + r * Math.sin(ang),
      });
    }

    // Flanco direito (involuta descendente de Ra até rStart)
    for (let s = involuteSamples; s >= 0; s--) {
      const r = rStart + ((Ra - rStart) * s) / involuteSamples;
      const phi = Math.acos(Math.min(1, Rb / r));
      const invPhi = Math.tan(phi) - phi;
      const ang = toothCenterAngle + (halfBaseAngle - invPhi);
      pts.push({
        x: cx + r * Math.cos(ang),
        y: cy + r * Math.sin(ang),
      });
    }

    // Ponto de raiz direita e arco de fundo até o próximo dente
    const rightBaseAngle = toothCenterAngle + halfBaseAngle;
    const nextLeftBaseAngle = nextToothCenterAngle - halfBaseAngle;
    const rootMidAngle = (rightBaseAngle + nextLeftBaseAngle) / 2;

    if (Rf < Rb) {
      pts.push({
        x: cx + Rf * Math.cos(rightBaseAngle),
        y: cy + Rf * Math.sin(rightBaseAngle),
      });
    }
    pts.push({
      x: cx + Rf * Math.cos(rootMidAngle),
      y: cy + Rf * Math.sin(rootMidAngle),
    });
  }

  const outerGearEntity: Extract<Entity, { type: "polyline" }> = {
    id: `reveng-gear-outer-${Date.now()}`,
    type: "polyline",
    layer: params.targetLayer ?? "corte",
    pts,
    closed: true,
    params: {
      infoStatus: "CALCULADO",
      featureKind: "spur_gear_outer",
      toothCountZ: Z,
      moduleMm: m,
      pitchDiameterMm: estimation.pitchDiameterMm,
      outerDiameterMm: estimation.theoreticalOuterDiameterMm,
      rootDiameterMm: estimation.rootDiameterMm,
    },
  };

  const pitchCircleEntity: Extract<Entity, { type: "circle" }> = {
    id: `reveng-gear-pitch-${Date.now()}`,
    type: "circle",
    layer: "construcao",
    isConstruction: true,
    cx,
    cy,
    r: Rp,
    params: {
      infoStatus: "CALCULADO",
      featureKind: "spur_gear_pitch_circle",
      pitchDiameterMm: estimation.pitchDiameterMm,
    },
  };

  const allEntities: Entity[] = [outerGearEntity, pitchCircleEntity];
  let boreEntity: Extract<Entity, { type: "circle" }> | undefined;

  if (params.centerBoreDiameterMm && params.centerBoreDiameterMm > 0) {
    boreEntity = {
      id: `reveng-gear-bore-${Date.now()}`,
      type: "circle",
      layer: "recorte",
      cx,
      cy,
      r: params.centerBoreDiameterMm / 2,
      params: {
        infoStatus: "MEDIDO",
        featureKind: "spur_gear_center_bore",
        boreDiameterMm: params.centerBoreDiameterMm,
      },
    };
    allEntities.push(boreEntity);
  }

  return {
    estimation,
    outerGearEntity,
    pitchCircleEntity,
    boreEntity,
    allEntities,
  };
}
