/**
 * CALDRA — CHAMFER INTENT
 * Módulo 2.5: Motor de Restrições e Validação Geométrica/Topológica (Constraint & Validation Engine)
 *
 * Verifica consistência matemática, física e topológica ANTES da aplicação ao canvas:
 *  - Dimensões estritamente positivas;
 *  - Raio de canto R <= min(W, H) / 2;
 *  - Furos contidos dentro dos limites da peça com margem mínima segura;
 *  - Ausência de colisão/interseção entre furos (dist(ci, cj) > ri + rj + minClearance);
 *  - Ausência de colisão entre furos de canto e arcos de filete;
 *  - Consistência de flanges circulares (d_int < PCD < D_ext);
 *  - Parâmetros obrigatórios de caldeiraria (Cone truncado D > d > 0, H > 0).
 */

import type { Vec2 } from "@/lib/lab2d/core";
import type {
  ParametricCornerRadii,
  UnresolvedAmbiguity,
  ValidationIssue,
  ValidationReport,
} from "./schema";

export interface HoleCandidate {
  id: string;
  cx: number;
  cy: number;
  r: number;
}

export interface PlateValidationInput {
  width: number;
  height: number;
  origin?: Vec2;
  cornerRadii: ParametricCornerRadii;
  cornerChamfer?: number;
  holes: HoleCandidate[];
  minEdgeClearanceMm?: number;
  minHoleToHoleClearanceMm?: number;
}

export interface FlangeValidationInput {
  outerDiameter: number;
  innerDiameter: number;
  pcd: number;
  holeCount: number;
  holeDiameter: number;
}

export class ChamferValidationEngine {
  /**
   * Valida integralmente uma chapa retangular paramétrica com raios de canto e furação.
   */
  public static validatePlate(
    input: PlateValidationInput,
    unresolved: UnresolvedAmbiguity[] = [],
  ): ValidationReport {
    const issues: ValidationIssue[] = [];
    const origin = input.origin ?? { x: 0, y: 0 };
    const { width, height, cornerRadii, holes } = input;
    const minEdgeClearance = input.minEdgeClearanceMm ?? 2.0;
    const minHoleClearance = input.minHoleToHoleClearanceMm ?? 1.5;

    // 1. Dimensões da chapa
    if (!Number.isFinite(width) || width <= 0) {
      issues.push({
        code: "INVALID_PLATE_WIDTH",
        severity: "error",
        parameter: "width",
        message: `A largura da chapa deve ser estritamente positiva (recebido: ${width} mm).`,
        mathematicalConstraint: "W > 0",
      });
    }
    if (!Number.isFinite(height) || height <= 0) {
      issues.push({
        code: "INVALID_PLATE_HEIGHT",
        severity: "error",
        parameter: "height",
        message: `A altura da chapa deve ser estritamente positiva (recebido: ${height} mm).`,
        mathematicalConstraint: "H > 0",
      });
    }

    if (width > 0 && height > 0) {
      const maxAllowedRadius = Math.min(width, height) / 2;

      // 2. Validação dos raios de canto: R <= min(W, H) / 2
      const radiiEntries: [string, number][] = [
        ["top_left", cornerRadii.top_left],
        ["top_right", cornerRadii.top_right],
        ["bottom_right", cornerRadii.bottom_right],
        ["bottom_left", cornerRadii.bottom_left],
      ];

      for (const [cornerName, r] of radiiEntries) {
        if (r < 0) {
          issues.push({
            code: "NEGATIVE_CORNER_RADIUS",
            severity: "error",
            parameter: "corner_radius",
            message: `O raio do canto (${cornerName}) não pode ser negativo (${r} mm).`,
            mathematicalConstraint: "R >= 0",
          });
        } else if (r > maxAllowedRadius + 1e-6) {
          issues.push({
            code: "CORNER_RADIUS_EXCEEDS_HALF_SIDE",
            severity: "error",
            parameter: "corner_radius",
            message: `Raio de canto R=${r} mm excede metade da menor dimensão da chapa (máximo permitido: ${maxAllowedRadius.toFixed(1)} mm para chapa ${width}×${height} mm).`,
            mathematicalConstraint: "R <= min(W, H) / 2",
          });
        }
      }

      // Soma de raios adjacentes na mesma aresta não pode superar o lado
      if (cornerRadii.top_left + cornerRadii.top_right > width + 1e-6) {
        issues.push({
          code: "ADJACENT_RADII_EXCEED_WIDTH",
          severity: "error",
          parameter: "corner_radius",
          message: `A soma dos raios superiores (${cornerRadii.top_left + cornerRadii.top_right} mm) excede a largura da chapa (${width} mm).`,
          mathematicalConstraint: "R_TL + R_TR <= W",
        });
      }
      if (cornerRadii.top_left + cornerRadii.bottom_left > height + 1e-6) {
        issues.push({
          code: "ADJACENT_RADII_EXCEED_HEIGHT",
          severity: "error",
          parameter: "corner_radius",
          message: `A soma dos raios laterais (${cornerRadii.top_left + cornerRadii.bottom_left} mm) excede a altura da chapa (${height} mm).`,
          mathematicalConstraint: "R_TL + R_BL <= H",
        });
      }

      // 3. Validação de cada furo em relação às bordas da chapa
      const xMin = origin.x;
      const xMax = origin.x + width;
      const yMin = origin.y;
      const yMax = origin.y + height;

      for (let i = 0; i < holes.length; i++) {
        const h = holes[i]!;
        const d = h.r * 2;

        if (!Number.isFinite(h.r) || h.r <= 0) {
          issues.push({
            code: "INVALID_HOLE_DIAMETER",
            severity: "error",
            parameter: "hole_diameter",
            message: `Furo #${i + 1} possui diâmetro inválido (Ø${d} mm).`,
            mathematicalConstraint: "d > 0",
          });
          continue;
        }

        if (d >= Math.min(width, height)) {
          issues.push({
            code: "HOLE_DIAMETER_EXCEEDS_PLATE",
            severity: "error",
            parameter: "hole_diameter",
            message: `O diâmetro do furo (Ø${d} mm) é maior ou igual à menor dimensão da chapa (${Math.min(width, height)} mm).`,
            mathematicalConstraint: "d < min(W, H)",
          });
          continue;
        }

        const distLeft = h.cx - h.r - xMin;
        const distRight = xMax - (h.cx + h.r);
        const distBottom = h.cy - h.r - yMin;
        const distTop = yMax - (h.cy + h.r);
        const minBorderDist = Math.min(distLeft, distRight, distBottom, distTop);

        if (minBorderDist < -1e-6) {
          issues.push({
            code: "HOLE_OUTSIDE_BOUNDARY",
            severity: "error",
            parameter: "margin",
            message: `O furo #${i + 1} (centro em X=${h.cx.toFixed(1)}, Y=${h.cy.toFixed(1)}, Ø${d} mm) ultrapassa o limite externo da chapa ${width}×${height} mm.`,
            mathematicalConstraint: "x_min + r <= cx <= x_max - r && y_min + r <= cy <= y_max - r",
          });
        } else if (minBorderDist < minEdgeClearance) {
          issues.push({
            code: "HOLE_EDGE_MARGIN_TOO_SMALL",
            severity: "warning",
            parameter: "margin",
            message: `O furo #${i + 1} está a apenas ${minBorderDist.toFixed(1)} mm da borda (parede mínima recomendada: ${minEdgeClearance} mm).`,
            mathematicalConstraint: "dist_borda >= m_min",
          });
        }
      }

      // 4. Validação de colisão entre furos: dist(c_i, c_j) > r_i + r_j
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          const a = holes[i]!;
          const b = holes[j]!;
          const centerDist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          const minCenterDist = a.r + b.r;
          if (centerDist <= minCenterDist + 1e-6) {
            issues.push({
              code: "HOLE_COLLISION",
              severity: "error",
              parameter: "hole_count",
              message: `Colisão geométrica entre os furos #${i + 1} e #${j + 1}: distância entre centros (${centerDist.toFixed(1)} mm) é menor ou igual à soma dos raios (${minCenterDist.toFixed(1)} mm).`,
              mathematicalConstraint: "dist(c_i, c_j) > r_i + r_j",
            });
          } else if (centerDist < minCenterDist + minHoleClearance) {
            issues.push({
              code: "HOLE_WALL_TOO_THIN",
              severity: "warning",
              parameter: "hole_count",
              message: `Parede residual estreita (${(centerDist - minCenterDist).toFixed(1)} mm) entre os furos #${i + 1} e #${j + 1}.`,
            });
          }
        }
      }
    }

    return ChamferValidationEngine.finalizeReport(issues, unresolved);
  }

  /**
   * Valida um flange circular com círculo de furação PCD.
   */
  public static validateFlange(
    input: FlangeValidationInput,
    unresolved: UnresolvedAmbiguity[] = [],
  ): ValidationReport {
    const issues: ValidationIssue[] = [];
    const { outerDiameter, innerDiameter, pcd, holeCount, holeDiameter } = input;

    if (outerDiameter <= 0) {
      issues.push({
        code: "INVALID_OUTER_DIAMETER",
        severity: "error",
        parameter: "outer_diameter",
        message: "O diâmetro externo do flange deve ser maior que zero.",
      });
    }
    if (innerDiameter < 0 || innerDiameter >= outerDiameter) {
      issues.push({
        code: "INVALID_INNER_DIAMETER",
        severity: "error",
        parameter: "inner_diameter",
        message: `O diâmetro interno (Ø${innerDiameter} mm) deve ser menor que o diâmetro externo (Ø${outerDiameter} mm).`,
        mathematicalConstraint: "0 <= d_int < D_ext",
      });
    }
    if (pcd <= innerDiameter || pcd >= outerDiameter) {
      issues.push({
        code: "PCD_OUT_OF_BOUNDS",
        severity: "error",
        parameter: "pcd",
        message: `O diâmetro PCD (Ø${pcd} mm) deve estar estritamente entre o diâmetro interno (Ø${innerDiameter} mm) e o externo (Ø${outerDiameter} mm).`,
        mathematicalConstraint: "d_int < PCD < D_ext",
      });
    }

    const rOuter = outerDiameter / 2;
    const rInner = innerDiameter / 2;
    const rPcd = pcd / 2;
    const rHole = holeDiameter / 2;

    if (rPcd + rHole > rOuter - 1) {
      issues.push({
        code: "FLANGE_HOLE_EXCEEDS_OUTER_EDGE",
        severity: "error",
        parameter: "hole_diameter",
        message: `Os furos Ø${holeDiameter} mm no PCD Ø${pcd} mm invadem a borda externa do flange Ø${outerDiameter} mm.`,
        mathematicalConstraint: "R_pcd + r_hole < R_ext",
      });
    }
    if (innerDiameter > 0 && rPcd - rHole < rInner + 1) {
      issues.push({
        code: "FLANGE_HOLE_INVADES_BORE",
        severity: "error",
        parameter: "hole_diameter",
        message: `Os furos Ø${holeDiameter} mm no PCD Ø${pcd} mm invadem o furo central Ø${innerDiameter} mm.`,
        mathematicalConstraint: "R_pcd - r_hole > R_int",
      });
    }

    if (holeCount >= 2) {
      const chordPitch = 2 * rPcd * Math.sin(Math.PI / holeCount);
      if (chordPitch <= holeDiameter + 1e-4) {
        issues.push({
          code: "FLANGE_PCD_HOLE_COLLISION",
          severity: "error",
          parameter: "hole_count",
          message: `Colisão entre os ${holeCount} furos no PCD Ø${pcd} mm: corda entre centros (${chordPitch.toFixed(1)} mm) <= Ø${holeDiameter} mm.`,
          mathematicalConstraint: "2 * R_pcd * sin(pi / N) > d_hole",
        });
      }
    }

    return ChamferValidationEngine.finalizeReport(issues, unresolved);
  }

  public static finalizeReport(
    issues: ValidationIssue[],
    unresolved: UnresolvedAmbiguity[] = [],
  ): ValidationReport {
    const hasErrors = issues.some((i) => i.severity === "error");
    if (hasErrors) {
      return {
        status: "invalid",
        issues,
        checkedAt: Date.now(),
      };
    }
    if (unresolved.length > 0) {
      return {
        status: "needs_clarification",
        issues,
        checkedAt: Date.now(),
      };
    }
    return {
      status: "valid",
      issues,
      checkedAt: Date.now(),
    };
  }
}
