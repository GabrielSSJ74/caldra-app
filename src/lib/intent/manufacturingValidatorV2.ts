/**
 * CALDRA — CHAMFER INTENT 2.0
 * Seção 8 (Claude Prompt Mestre): Validador Geométrico e de Fabricação (DFM — Design for Manufacturing)
 *
 * Regras de Fabricação (§8):
 * - Erros (bloqueiam):
 *   1. Furo ou recorte cruzando o contorno externo;
 *   2. Raio/chanfro maior que o permitido (raio > min(w, h)/2, ou cantos adjacentes que se sobrepõem);
 *   3. Furos sobrepostos (dist(c_i, c_j) <= (d_i + d_j)/2);
 *   4. Ø <= 0 ou dimensões de peça <= 0;
 *   5. Contorno aberto onde se exige fechado;
 *   6. Entidades duplicadas ou sobrepostas (sinalizar e permitir mesclar).
 * - Alertas (liberam, mas avisam; limiares configuráveis):
 *   1. Alma (material entre furo e borda, ou entre furos) menor que max(espessura, 2 mm),
 *      ou menor que 0,5·Ø se não houver espessura;
 *   2. Ø menor que a espessura em corte térmico (laser, plasma, oxicorte);
 *   3. Centro do furo a menos de 1,5·Ø da borda quando for passante para parafuso;
 *   4. Raio interno de dobra menor que a espessura.
 *
 * Cada item sai com entity_id, valor medido (measured_value), limite (limit_value),
 * correção numérica sugerida (suggested_fix) e até 2 alternativas numéricas clicáveis.
 */

import { bbox, type Entity } from "@/lib/lab2d/core";
import type { PartModel } from "./partModel";

export interface NumericAlternativeOption {
  id: string;
  label: string;
  description: string;
  patch: Record<string, unknown>;
}

export const MAX_OPERATIONS_PER_TURN = 500;

export interface ManufacturingValidationItem {
  code:
    | "HOLE_CROSSES_CONTOUR"
    | "CUTOUT_CROSSES_CONTOUR"
    | "CORNER_EXCEEDS_LIMIT"
    | "ADJACENT_CORNERS_OVERLAP"
    | "HOLES_OVERLAP"
    | "NON_POSITIVE_DIMENSION"
    | "OPEN_CONTOUR"
    | "DUPLICATE_ENTITIES"
    | "OPERATION_LIMIT_EXCEEDED"
    | "THIN_WEB_TO_EDGE"
    | "THIN_WEB_BETWEEN_HOLES"
    | "HOLE_SMALLER_THAN_THICKNESS"
    | "BOLT_EDGE_DISTANCE_LOW"
    | "BEND_RADIUS_BELOW_THICKNESS";
  severity: "error" | "warning";
  entity_id: string;
  parameter?: string;
  measured_value: number;
  limit_value: number;
  message: string;
  suggested_fix: string;
  numeric_alternatives?: NumericAlternativeOption[];
}

export interface ManufacturingThresholds {
  process?: "laser" | "plasma" | "oxicorte" | "punch";
  thicknessMm?: number;
  minAbsoluteWebMm?: number;
  boltEdgeFactor?: number;
  maxOperationsPerTurn?: number;
}

export interface ManufacturingValidationReportV2 {
  ok: boolean;
  status: "VALIDADO" | "ALERTA" | "ERRO";
  errors: ManufacturingValidationItem[];
  warnings: ManufacturingValidationItem[];
  mergedDuplicateIds: string[];
  conflictExplanation?: string;
  conflictAlternatives: NumericAlternativeOption[];
}

export class ManufacturingValidatorV2 {
  /**
   * Valida o estado completo das entidades e do PartModel segundo a Seção 8 do Prompt Mestre e §16/§19.3 do ChatGPT.
   */
  public static validate(params: {
    entities: Entity[];
    partModel: PartModel;
    thresholds?: ManufacturingThresholds;
    requestedCornerSize?: number;
    requestedPlateWidth?: number;
    requestedPlateHeight?: number;
    requestedOperationCount?: number;
    hasBoltClearanceHoles?: boolean;
    bendRadiusMm?: number;
  }): ManufacturingValidationReportV2 {
    const {
      entities,
      partModel,
      thresholds = {},
      requestedCornerSize,
      requestedPlateWidth,
      requestedPlateHeight,
      requestedOperationCount = 0,
      hasBoltClearanceHoles = false,
      bendRadiusMm,
    } = params;

    const errors: ManufacturingValidationItem[] = [];
    const warnings: ManufacturingValidationItem[] = [];
    const mergedDuplicateIds: string[] = [];

    const thickness = thresholds.thicknessMm ?? partModel.thickness ?? 0;
    const minAbsWeb = thresholds.minAbsoluteWebMm ?? 2.0;
    const process = thresholds.process ?? "laser";
    const boltEdgeFactor = thresholds.boltEdgeFactor ?? 1.5;
    const maxOps = thresholds.maxOperationsPerTurn ?? MAX_OPERATIONS_PER_TURN;

    // 0. Limite operacional por turno (§19.3 — teto de 500 operações/entidades geradas num único turno)
    const effectiveOpCount = Math.max(requestedOperationCount, entities.length);
    if (effectiveOpCount > maxOps) {
      errors.push({
        code: "OPERATION_LIMIT_EXCEEDED",
        severity: "error",
        entity_id: "part_model",
        parameter: "hole_count",
        measured_value: effectiveOpCount,
        limit_value: maxOps,
        message: `O pedido exige ${effectiveOpCount} operações/entidades em um único turno, excedendo o limite operacional de segurança (${maxOps}).`,
        suggested_fix: `Divida a solicitação em etapas menores (máximo de ${maxOps} elementos por turno).`,
        numeric_alternatives: [
          {
            id: "alt_limit_100",
            label: "Limitar a 100 elementos",
            description: "Executa a primeira etapa com 100 elementos",
            patch: { hole_count: 100 },
          },
          {
            id: "alt_limit_500",
            label: `Usar teto de ${maxOps} elementos`,
            description: `Executa no limite máximo permitido por turno (${maxOps})`,
            patch: { hole_count: maxOps },
          },
        ],
      });
    }

    // 1. Verificar chapa-base / contorno principal e limites de raio/chanfro
    const plateFeature = partModel.entities.find(
      (e) => e.type === "plate" || e.type === "rectangle" || e.type === "flange",
    );

    const w =
      requestedPlateWidth ??
      (plateFeature ? Number(plateFeature.params.w ?? plateFeature.params.d_out ?? 0) : partModel.bbox[2]);
    const h =
      requestedPlateHeight ??
      (plateFeature ? Number(plateFeature.params.h ?? plateFeature.params.d_out ?? 0) : partModel.bbox[3]);

    if ((requestedPlateWidth !== undefined && requestedPlateWidth <= 0) || (requestedPlateHeight !== undefined && requestedPlateHeight <= 0)) {
      errors.push({
        code: "NON_POSITIVE_DIMENSION",
        severity: "error",
        entity_id: plateFeature?.id ?? "plate_1",
        parameter: requestedPlateWidth !== undefined && requestedPlateWidth <= 0 ? "width" : "height",
        measured_value: Math.min(requestedPlateWidth ?? 1, requestedPlateHeight ?? 1),
        limit_value: 1,
        message: `Dimensões da peça devem ser maiores que zero (recebido ${requestedPlateWidth ?? w} × ${requestedPlateHeight ?? h} mm).`,
        suggested_fix: "Defina largura e altura positivas (ex.: 200 × 100 mm).",
        numeric_alternatives: [
          {
            id: "fix_dim_200_100",
            label: "Usar 200 × 100 mm",
            description: "Define chapa padrão de 200 × 100 mm",
            patch: { width: 200, height: 100 },
          },
          {
            id: "fix_dim_500_250",
            label: "Usar 500 × 250 mm",
            description: "Define chapa padrão de 500 × 250 mm",
            patch: { width: 500, height: 250 },
          },
        ],
      });
    }

    const cornerObj = plateFeature?.params.corners as
      | { mode?: string; size?: number; which?: string | string[] }
      | undefined;
    const cornerSize =
      requestedCornerSize !== undefined
        ? requestedCornerSize
        : Number(cornerObj?.size ?? plateFeature?.params.corner_radius ?? 0);

    if (w > 0 && h > 0 && cornerSize > 0) {
      const minSide = Math.min(w, h);
      const maxCorner = Number((minSide / 2).toFixed(2));
      if (cornerSize > maxCorner + 1e-6) {
        const minNeededSide = cornerSize * 2;
        const altW = Math.max(w, minNeededSide);
        const altH = Math.max(h, minNeededSide);
        errors.push({
          code: "CORNER_EXCEEDS_LIMIT",
          severity: "error",
          entity_id: plateFeature?.id ?? "plate_1",
          parameter: "corner_radius",
          measured_value: cornerSize,
          limit_value: maxCorner,
          message: `Raio/chanfro R${cornerSize} mm excede metade do menor lado da peça ${w}×${h} mm (máximo permitido: R${maxCorner} mm).`,
          suggested_fix: `Reduzir raio para R${maxCorner} mm ou aumentar o menor lado para ${minNeededSide} mm.`,
          numeric_alternatives: [
            {
              id: "alt_reduce_radius",
              label: `Usar R${maxCorner} mm`,
              description: `Limita o raio ao máximo geométrico (metade de ${minSide} mm)`,
              patch: { corner_radius: maxCorner },
            },
            {
              id: "alt_increase_plate",
              label: `Aumentar chapa para ${altW} × ${altH} mm`,
              description: `Amplia a peça para comportar R${cornerSize} mm sem sobrepor cantos`,
              patch: { width: altW, height: altH, corner_radius: cornerSize },
            },
          ],
        });
      }
    }

    // 2. Verificar contorno fechado (polylines na camada corte)
    const contourPolylines = entities.filter(
      (e): e is Extract<Entity, { type: "polyline" }> =>
        e.type === "polyline" && e.layer === "corte",
    );
    for (const poly of contourPolylines) {
      if (!poly.closed && poly.pts.length >= 3) {
        const first = poly.pts[0]!;
        const last = poly.pts[poly.pts.length - 1]!;
        const gap = Math.hypot(last.x - first.x, last.y - first.y);
        if (gap > 1e-3) {
          errors.push({
            code: "OPEN_CONTOUR",
            severity: "error",
            entity_id: poly.id,
            measured_value: Number(gap.toFixed(2)),
            limit_value: 0,
            message: `O contorno '${poly.id}' está aberto (abertura de ${gap.toFixed(2)} mm entre início e fim).`,
            suggested_fix: "Fechar o contorno externo (closed: true) antes do corte.",
          });
        }
      }
    }

    // 3. Verificar furos (Ø <= 0, cruzamento com contorno, sobreposição e alertas de alma/corte térmico)
    let circleHoles: Extract<Entity, { type: "circle" }>[] = entities.filter(
      (e): e is Extract<Entity, { type: "circle" }> =>
        e.type === "circle" &&
        e.layer !== "referencia" &&
        !e.isConstruction,
    );

    // Se entities estiver vazio mas partModel tiver hole_pattern com derived.centers, sintetiza círculos para validação
    if (circleHoles.length === 0 && partModel.entities.length > 0) {
      const synth: Extract<Entity, { type: "circle" }>[] = [];
      for (const pmEnt of partModel.entities) {
        if (pmEnt.type === "hole_pattern" || pmEnt.type === "hole") {
          const d = Number(pmEnt.params.d ?? pmEnt.params.diameter ?? 0);
          const centers = pmEnt.derived?.centers ?? [];
          centers.forEach((pt, idx) => {
            synth.push({
              id: `${pmEnt.id}_${idx + 1}`,
              type: "circle",
              layer: "corte",
              cx: pt[0],
              cy: pt[1],
              r: d / 2,
            });
          });
        }
      }
      circleHoles = synth;
    }

    const outerEntities = entities.filter(
      (e) =>
        e.layer === "corte" &&
        e.type !== "circle" &&
        !e.isConstruction,
    );
    const outerBox =
      outerEntities.length > 0
        ? bbox(outerEntities)
        : w > 0 && h > 0
          ? { minX: 0, minY: 0, maxX: w, maxY: h }
          : null;

    // Se a peça for um flange circular, o contorno externo é o maior círculo
    let flangeOuterCircle: Extract<Entity, { type: "circle" }> | null = null;
    let flangeInnerCircle: Extract<Entity, { type: "circle" }> | null = null;
    if (plateFeature?.type === "flange" && circleHoles.length >= 2) {
      const sortedByR = [...circleHoles].sort((a, b) => b.r - a.r);
      flangeOuterCircle = sortedByR[0] ?? null;
      const innerCandidate = sortedByR.find(
        (c) =>
          c.id !== flangeOuterCircle?.id &&
          Math.hypot(c.cx - flangeOuterCircle!.cx, c.cy - flangeOuterCircle!.cy) < 1e-2,
      );
      flangeInnerCircle = innerCandidate ?? null;
    }

    const activeHoles = circleHoles.filter(
      (c) => c.id !== flangeOuterCircle?.id && c.id !== flangeInnerCircle?.id,
    );

    // 3a. Duplicatas exatas de furos
    const seenCoords = new Map<string, string>();
    for (const hole of activeHoles) {
      const key = `${hole.cx.toFixed(2)}_${hole.cy.toFixed(2)}_${hole.r.toFixed(2)}`;
      const existingId = seenCoords.get(key);
      if (existingId) {
        mergedDuplicateIds.push(hole.id);
        errors.push({
          code: "DUPLICATE_ENTITIES",
          severity: "error",
          entity_id: hole.id,
          measured_value: 0,
          limit_value: 0.1,
          message: `Furo duplicado '${hole.id}' sobreposto exatamente a '${existingId}' em (${hole.cx.toFixed(1)}, ${hole.cy.toFixed(1)}).`,
          suggested_fix: `Mesclar/remover a entidade duplicada '${hole.id}'.`,
        });
      } else {
        seenCoords.set(key, hole.id);
      }
    }

    for (let i = 0; i < activeHoles.length; i++) {
      const hEnt = activeHoles[i]!;
      const d = Number((hEnt.r * 2).toFixed(2));

      if (d <= 0) {
        errors.push({
          code: "NON_POSITIVE_DIMENSION",
          severity: "error",
          entity_id: hEnt.id,
          parameter: "hole_diameter",
          measured_value: d,
          limit_value: 1,
          message: `O furo '${hEnt.id}' possui diâmetro inválido (Ø${d} mm <= 0).`,
          suggested_fix: "Definir diâmetro positivo (ex.: Ø10 mm ou Ø12 mm).",
          numeric_alternatives: [
            {
              id: "alt_hole_10",
              label: "Usar Ø10 mm",
              description: "Define diâmetro de furo Ø10 mm",
              patch: { hole_diameter: 10 },
            },
            {
              id: "alt_hole_12",
              label: "Usar Ø12 mm",
              description: "Define diâmetro de furo Ø12 mm",
              patch: { hole_diameter: 12 },
            },
          ],
        });
        continue;
      }

      // Alerta corte térmico: Ø < espessura
      if (thickness > 0 && (process === "laser" || process === "plasma" || process === "oxicorte")) {
        if (d < thickness - 1e-6) {
          warnings.push({
            code: "HOLE_SMALLER_THAN_THICKNESS",
            severity: "warning",
            entity_id: hEnt.id,
            parameter: "hole_diameter",
            measured_value: d,
            limit_value: thickness,
            message: `Furo '${hEnt.id}' (Ø${d} mm) é menor que a espessura da chapa (${thickness} mm) para corte térmico (${process}).`,
            suggested_fix: `Aumentar diâmetro para pelo menos Ø${thickness} mm ou puncionar/furar em bancada.`,
          });
        }
      }

      // Validação em relação à borda (chapa retangular ou flange)
      if (flangeOuterCircle) {
        const radialDist = Math.hypot(
          hEnt.cx - flangeOuterCircle.cx,
          hEnt.cy - flangeOuterCircle.cy,
        );
        const outerWeb = flangeOuterCircle.r - (radialDist + hEnt.r);
        const innerWeb = flangeInnerCircle
          ? radialDist - hEnt.r - flangeInnerCircle.r
          : radialDist - hEnt.r;
        const minWeb = Math.min(outerWeb, innerWeb);
        const requiredWeb = thickness > 0 ? Math.max(thickness, minAbsWeb) : Math.max(0.5 * d, minAbsWeb);

        if (minWeb < -1e-6) {
          const safePcd = flangeInnerCircle
            ? Number((flangeOuterCircle.r + flangeInnerCircle.r).toFixed(1))
            : Number((flangeOuterCircle.r * 1.3).toFixed(1));
          const maxHoleD = Math.max(
            4,
            Math.floor((flangeOuterCircle.r - (flangeInnerCircle?.r ?? 0)) * 0.5),
          );
          errors.push({
            code: "HOLE_CROSSES_CONTOUR",
            severity: "error",
            entity_id: hEnt.id,
            parameter: "pcd",
            measured_value: Number(minWeb.toFixed(2)),
            limit_value: 0,
            message: `Furo '${hEnt.id}' (Ø${d} mm) cruza o contorno do flange (invasão de ${Math.abs(minWeb).toFixed(1)} mm).`,
            suggested_fix: `Ajustar PCD para Ø${safePcd} mm ou reduzir furos para Ø${maxHoleD} mm.`,
            numeric_alternatives: [
              {
                id: "alt_flange_pcd",
                label: `Ajustar PCD para Ø${safePcd} mm`,
                description: "Centraliza o círculo de furação na coroa do flange",
                patch: { pcd: safePcd },
              },
              {
                id: "alt_flange_hole_d",
                label: `Reduzir furos para Ø${maxHoleD} mm`,
                description: "Mantém o PCD e reduz o diâmetro dos furos",
                patch: { hole_diameter: maxHoleD },
              },
            ],
          });
        } else if (minWeb < requiredWeb) {
          warnings.push({
            code: "THIN_WEB_TO_EDGE",
            severity: "warning",
            entity_id: hEnt.id,
            parameter: "margin",
            measured_value: Number(minWeb.toFixed(2)),
            limit_value: Number(requiredWeb.toFixed(2)),
            message: `Alma estreita (${minWeb.toFixed(1)} mm) entre o furo '${hEnt.id}' e a borda do flange (mínimo recomendado: ${requiredWeb.toFixed(1)} mm).`,
            suggested_fix: `Garantir parede mínima de ${requiredWeb.toFixed(1)} mm.`,
          });
        }
      } else if (outerBox) {
        const distLeft = hEnt.cx - hEnt.r - outerBox.minX;
        const distRight = outerBox.maxX - (hEnt.cx + hEnt.r);
        const distBottom = hEnt.cy - hEnt.r - outerBox.minY;
        const distTop = outerBox.maxY - (hEnt.cy + hEnt.r);
        const minEdgeWeb = Math.min(distLeft, distRight, distBottom, distTop);
        const minCenterToEdge = minEdgeWeb + hEnt.r;

        const requiredWeb =
          thickness > 0 ? Math.max(thickness, minAbsWeb) : Math.max(0.5 * d, minAbsWeb);

        if (minEdgeWeb < -1e-6) {
          const safeMargin = Math.ceil(hEnt.r + requiredWeb + 3);
          const safeDiameter = Math.max(4, Math.floor((minCenterToEdge - requiredWeb) * 2));
          errors.push({
            code: "HOLE_CROSSES_CONTOUR",
            severity: "error",
            entity_id: hEnt.id,
            parameter: "margin",
            measured_value: Number(minEdgeWeb.toFixed(2)),
            limit_value: 0,
            message: `O furo '${hEnt.id}' (Ø${d} mm em X=${hEnt.cx.toFixed(1)}, Y=${hEnt.cy.toFixed(1)}) cruza o contorno da chapa.`,
            suggested_fix: `Aumentar margem da borda para ${safeMargin} mm ou reduzir diâmetro para Ø${safeDiameter} mm.`,
            numeric_alternatives: [
              {
                id: "alt_increase_margin",
                label: `Usar margem de ${safeMargin} mm`,
                description: `Afasta o centro do furo para ${safeMargin} mm da borda`,
                patch: { margin: safeMargin },
              },
              {
                id: "alt_reduce_hole_d",
                label: `Reduzir furo para Ø${safeDiameter} mm`,
                description: `Mantém a posição e reduz o diâmetro para Ø${safeDiameter} mm`,
                patch: { hole_diameter: safeDiameter },
              },
            ],
          });
        } else {
          if (minEdgeWeb < requiredWeb) {
            const suggestedMargin = Number((hEnt.r + requiredWeb).toFixed(1));
            warnings.push({
              code: "THIN_WEB_TO_EDGE",
              severity: "warning",
              entity_id: hEnt.id,
              parameter: "margin",
              measured_value: Number(minEdgeWeb.toFixed(2)),
              limit_value: Number(requiredWeb.toFixed(2)),
              message: `Alma entre o furo '${hEnt.id}' e a borda é de ${minEdgeWeb.toFixed(1)} mm (mínimo recomendado: ${requiredWeb.toFixed(1)} mm).`,
              suggested_fix: `Aumentar distância do centro à borda para pelo menos ${suggestedMargin} mm.`,
            });
          }

          if (hasBoltClearanceHoles && minCenterToEdge < boltEdgeFactor * d - 1e-6) {
            const minBoltCenterDist = Number((boltEdgeFactor * d).toFixed(1));
            warnings.push({
              code: "BOLT_EDGE_DISTANCE_LOW",
              severity: "warning",
              entity_id: hEnt.id,
              parameter: "margin",
              measured_value: Number(minCenterToEdge.toFixed(2)),
              limit_value: minBoltCenterDist,
              message: `Centro do furo passante '${hEnt.id}' está a ${minCenterToEdge.toFixed(1)} mm da borda (recomendado >= 1,5·Ø = ${minBoltCenterDist} mm).`,
              suggested_fix: `Aumentar margem de borda para ${minBoltCenterDist} mm.`,
            });
          }
        }
      }
    }

    // 3b. Sobreposição e alma mínima entre pares de furos
    for (let i = 0; i < activeHoles.length; i++) {
      for (let j = i + 1; j < activeHoles.length; j++) {
        const a = activeHoles[i]!;
        const b = activeHoles[j]!;
        const centerDist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        if (centerDist < 1e-4) continue; // já tratado como duplicata exata

        const sumRadii = a.r + b.r;
        const webBetween = centerDist - sumRadii;
        const maxD = Math.max(a.r * 2, b.r * 2);
        const requiredWeb =
          thickness > 0 ? Math.max(thickness, minAbsWeb) : Math.max(0.5 * maxD, minAbsWeb);

        if (webBetween <= 1e-6) {
          const safeDiameter = Math.max(4, Math.floor(centerDist - requiredWeb));
          const safeCount = Math.max(2, activeHoles.length - 1);
          errors.push({
            code: "HOLES_OVERLAP",
            severity: "error",
            entity_id: `${a.id},${b.id}`,
            parameter: "hole_count",
            measured_value: Number(centerDist.toFixed(2)),
            limit_value: Number(sumRadii.toFixed(2)),
            message: `Furos sobrepostos ('${a.id}' e '${b.id}'): distância entre centros (${centerDist.toFixed(1)} mm) <= soma dos raios (${sumRadii.toFixed(1)} mm).`,
            suggested_fix: `Reduzir quantidade para ${safeCount} furos ou diminuir diâmetro para Ø${safeDiameter} mm.`,
            numeric_alternatives: [
              {
                id: "alt_reduce_count",
                label: `Reduzir para ${safeCount} furos`,
                description: `Aumenta o passo entre centros mantendo Ø${(a.r * 2).toFixed(0)} mm`,
                patch: { hole_count: safeCount },
              },
              {
                id: "alt_reduce_diameter",
                label: `Reduzir diâmetro para Ø${safeDiameter} mm`,
                description: `Mantém ${activeHoles.length} furos com alma segura`,
                patch: { hole_diameter: safeDiameter },
              },
            ],
          });
        } else if (webBetween < requiredWeb) {
          warnings.push({
            code: "THIN_WEB_BETWEEN_HOLES",
            severity: "warning",
            entity_id: `${a.id},${b.id}`,
            parameter: "pitch",
            measured_value: Number(webBetween.toFixed(2)),
            limit_value: Number(requiredWeb.toFixed(2)),
            message: `Alma estreita (${webBetween.toFixed(1)} mm) entre os furos '${a.id}' e '${b.id}' (mínimo recomendado: ${requiredWeb.toFixed(1)} mm).`,
            suggested_fix: `Aumentar passo entre furos para pelo menos ${(sumRadii + requiredWeb).toFixed(1)} mm.`,
          });
        }
      }
    }

    // 4. Alerta de raio interno de dobra menor que a espessura
    if (bendRadiusMm !== undefined && thickness > 0 && bendRadiusMm < thickness - 1e-6) {
      warnings.push({
        code: "BEND_RADIUS_BELOW_THICKNESS",
        severity: "warning",
        entity_id: "bend_1",
        parameter: "bend_radius",
        measured_value: bendRadiusMm,
        limit_value: thickness,
        message: `Raio interno de dobra (${bendRadiusMm} mm) é menor que a espessura da chapa (${thickness} mm), com risco de trinca na fibra externa.`,
        suggested_fix: `Utilizar raio interno de dobra R >= ${thickness} mm.`,
      });
    }

    // Consolidar alternativas de conflito (quando houver erros bloqueantes)
    const conflictAlternatives: NumericAlternativeOption[] = [];
    for (const err of errors) {
      if (err.numeric_alternatives) {
        for (const alt of err.numeric_alternatives) {
          if (conflictAlternatives.length < 2 && !conflictAlternatives.some((x) => x.id === alt.id)) {
            conflictAlternatives.push(alt);
          }
        }
      }
    }

    const ok = errors.length === 0;
    const status: ManufacturingValidationReportV2["status"] = !ok
      ? "ERRO"
      : warnings.length > 0
        ? "ALERTA"
        : "VALIDADO";

    const conflictExplanation = !ok
      ? `${errors[0]!.message} Sugestão: ${errors[0]!.suggested_fix}`
      : undefined;

    return {
      ok,
      status,
      errors,
      warnings,
      mergedDuplicateIds,
      conflictExplanation,
      conflictAlternatives,
    };
  }
}
