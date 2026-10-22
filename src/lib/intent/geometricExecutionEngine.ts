/**
 * CALDRA — CHAMFER INTENT
 * Módulo 2.4 & Seção 9: Motor de Execução Geométrica Determinístico (Geometric Execution Engine)
 *
 * Responsável exclusivamente pelo cálculo matemático exato de coordenadas,
 * arcos tangentes, matrizes lineares/polares (PCD), linhas de centro, cotas
 * associativas e planificações de caldeiraria, gerando entidades nativas do CHAMFER CAD.
 */

import {
  uid,
  type Entity,
  type LayerId,
  type Vec2,
  polygonEntity,
} from "@/lib/lab2d/core";
import { createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import { makeDimension, type Dimension } from "@/lib/lab2d/dimensions";
import { calculateSquareToRound } from "@/lib/geometry/squareToRound";
import { elbowModel } from "@/lib/geometry/elbowSegments";
import { branchDevelopments } from "@/lib/geometry/branch";
import type {
  CornerSelector,
  DistanceMeasurementMode,
  HoleDistributionMode,
  LinearHoleFormulaMode,
  ParametricCornerRadii,
  ParametricFeatureState,
  ParametricHoleGroup,
} from "./schema";
import type { HoleCandidate } from "./validationEngine";

const DEG2RAD = Math.PI / 180;

export class ChamferGeometricExecutionEngine {
  /**
   * 9.1 Fórmula 1: Comprimento útil L entre centros extremos e N >= 2 furos:
   *     p = L / (N - 1), x_i = x_0 + i * p
   */
  public static computeLinearPositionsFromSpan(
    x0: number,
    spanLength: number,
    count: number,
  ): { positions: number[]; pitch: number } {
    if (count <= 0) return { positions: [], pitch: 0 };
    if (count === 1) return { positions: [x0 + spanLength / 2], pitch: 0 };
    const pitch = spanLength / (count - 1);
    const positions = Array.from({ length: count }, (_, i) => x0 + i * pitch);
    return { positions, pitch };
  }

  /**
   * 9.1 Fórmula 2: Largura total W, margens iguais m e N >= 2 furos:
   *     p = (W - 2*m) / (N - 1), x_i = x_left + m + i * p
   */
  public static computeLinearPositionsWithMargin(
    xLeft: number,
    totalWidth: number,
    margin: number,
    count: number,
  ): { positions: number[]; pitch: number } {
    if (count <= 0) return { positions: [], pitch: 0 };
    if (count === 1) return { positions: [xLeft + totalWidth / 2], pitch: 0 };
    const pitch = (totalWidth - 2 * margin) / (count - 1);
    const positions = Array.from({ length: count }, (_, i) => xLeft + margin + i * pitch);
    return { positions, pitch };
  }

  /**
   * 9.1 Fórmula 3: Espaçamento igual incluindo as bordas sem margem fixa:
   *     p = W / (N + 1), x_i = x_left + (i + 1) * p
   */
  public static computeLinearPositionsEqualSubdivision(
    xLeft: number,
    totalWidth: number,
    count: number,
  ): { positions: number[]; pitch: number } {
    if (count <= 0) return { positions: [], pitch: 0 };
    const pitch = totalWidth / (count + 1);
    const positions = Array.from({ length: count }, (_, i) => xLeft + (i + 1) * pitch);
    return { positions, pitch };
  }

  /**
   * 9.2 Distribuição Circular de Furos (PCD - Pitch Circle Diameter):
   *     delta_theta = 2 * pi / N
   *     x_i = cx + R_pcd * cos(theta_0 + i * delta_theta)
   *     y_i = cy + R_pcd * sin(theta_0 + i * delta_theta)
   */
  public static computeCircularPcdCenters(
    center: Vec2,
    pcdDiameter: number,
    count: number,
    startAngleDeg = 0,
  ): Vec2[] {
    if (count <= 0 || pcdDiameter <= 0) return [];
    const rPcd = pcdDiameter / 2;
    const theta0 = startAngleDeg * DEG2RAD;
    const deltaTheta = (2 * Math.PI) / count;

    return Array.from({ length: count }, (_, i) => {
      const theta = theta0 + i * deltaTheta;
      return {
        x: Number((center.x + rPcd * Math.cos(theta)).toFixed(6)),
        y: Number((center.y + rPcd * Math.sin(theta)).toFixed(6)),
      };
    });
  }

  /**
   * 9.3 Resolve os raios individuais de cada um dos 4 cantos a partir de um seletor e raio R.
   * Convenção de coordenadas do CHAMFER:
   *   - bottom_left: (x0, y0)
   *   - bottom_right: (x0 + W, y0)
   *   - top_right: (x0 + W, y0 + H)
   *   - top_left: (x0, y0 + H)
   */
  public static resolveCornerRadii(
    radius: number,
    selector: CornerSelector = "all",
    existing?: ParametricCornerRadii,
  ): ParametricCornerRadii {
    const base: ParametricCornerRadii = existing
      ? { ...existing }
      : { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 };

    const r = Math.max(0, radius);
    switch (selector) {
      case "all":
        return { top_left: r, top_right: r, bottom_right: r, bottom_left: r };
      case "none":
        return { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 };
      case "left_two":
        return { ...base, top_left: r, bottom_left: r, top_right: existing ? base.top_right : 0, bottom_right: existing ? base.bottom_right : 0 };
      case "right_two":
        return { ...base, top_right: r, bottom_right: r, top_left: existing ? base.top_left : 0, bottom_left: existing ? base.bottom_left : 0 };
      case "top_two":
        return { ...base, top_left: r, top_right: r, bottom_left: existing ? base.bottom_left : 0, bottom_right: existing ? base.bottom_right : 0 };
      case "bottom_two":
        return { ...base, bottom_left: r, bottom_right: r, top_left: existing ? base.top_left : 0, top_right: existing ? base.top_right : 0 };
      case "top_left":
        return { ...base, top_left: r };
      case "top_right":
        return { ...base, top_right: r };
      case "bottom_right":
        return { ...base, bottom_right: r };
      case "bottom_left":
        return { ...base, bottom_left: r };
      default:
        return { top_left: r, top_right: r, bottom_right: r, bottom_left: r };
    }
  }

  /**
   * 9.3 Constrói o contorno da chapa com suporte a arredondamento seletivo por canto
   *     ou chanfro reto, preservando pontos de tangência exatos.
   */
  public static createPlateContourEntity(
    origin: Vec2,
    width: number,
    height: number,
    cornerRadii: ParametricCornerRadii,
    layer: LayerId = "corte",
    chamferDist = 0,
    cornerSelector: CornerSelector = "all",
    existingId?: string,
  ): Entity {
    const x0 = origin.x;
    const y0 = origin.y;
    const x1 = origin.x + width;
    const y1 = origin.y + height;

    const maxR = Math.min(width, height) / 2;
    const rBL = Math.min(Math.max(0, cornerRadii.bottom_left), maxR);
    const rBR = Math.min(Math.max(0, cornerRadii.bottom_right), maxR);
    const rTR = Math.min(Math.max(0, cornerRadii.top_right), maxR);
    const rTL = Math.min(Math.max(0, cornerRadii.top_left), maxR);

    const pts: Vec2[] = [];
    const arcSegments = 8;

    const addQuarterArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
      for (let i = 0; i <= arcSegments; i++) {
        const t = startAngle + (i / arcSegments) * (endAngle - startAngle);
        pts.push({
          x: Number((cx + r * Math.cos(t)).toFixed(4)),
          y: Number((cy + r * Math.sin(t)).toFixed(4)),
        });
      }
    };

    const isCornerSelected = (corner: "bottom_left" | "bottom_right" | "top_right" | "top_left") => {
      if (cornerSelector === "all") return true;
      if (cornerSelector === "none") return false;
      if (cornerSelector === corner) return true;
      if (cornerSelector === "left_two") return corner === "bottom_left" || corner === "top_left";
      if (cornerSelector === "right_two") return corner === "bottom_right" || corner === "top_right";
      if (cornerSelector === "top_two") return corner === "top_left" || corner === "top_right";
      if (cornerSelector === "bottom_two") return corner === "bottom_left" || corner === "bottom_right";
      return false;
    };

    const ch = Math.min(Math.max(0, chamferDist), maxR);

    // 1. Canto Inferior Esquerdo (x0, y0)
    if (ch > 0 && isCornerSelected("bottom_left")) {
      pts.push({ x: x0, y: y0 + ch }, { x: x0 + ch, y: y0 });
    } else if (rBL > 0) {
      addQuarterArc(x0 + rBL, y0 + rBL, rBL, Math.PI, (3 * Math.PI) / 2);
    } else {
      pts.push({ x: x0, y: y0 });
    }

    // 2. Canto Inferior Direito (x1, y0)
    if (ch > 0 && isCornerSelected("bottom_right")) {
      pts.push({ x: x1 - ch, y: y0 }, { x: x1, y: y0 + ch });
    } else if (rBR > 0) {
      addQuarterArc(x1 - rBR, y0 + rBR, rBR, -Math.PI / 2, 0);
    } else {
      pts.push({ x: x1, y: y0 });
    }

    // 3. Canto Superior Direito (x1, y1)
    if (ch > 0 && isCornerSelected("top_right")) {
      pts.push({ x: x1, y: y1 - ch }, { x: x1 - ch, y: y1 });
    } else if (rTR > 0) {
      addQuarterArc(x1 - rTR, y1 - rTR, rTR, 0, Math.PI / 2);
    } else {
      pts.push({ x: x1, y: y1 });
    }

    // 4. Canto Superior Esquerdo (x0, y1)
    if (ch > 0 && isCornerSelected("top_left")) {
      pts.push({ x: x0 + ch, y: y1 }, { x: x0, y: y1 - ch });
    } else if (rTL > 0) {
      addQuarterArc(x0 + rTL, y1 - rTL, rTL, Math.PI / 2, Math.PI);
    } else {
      pts.push({ x: x0, y: y1 });
    }

    return {
      id: existingId ?? uid(),
      layer,
      type: "polyline",
      closed: true,
      pts,
      params: {
        isParametricPlate: true,
        width,
        height,
        originX: x0,
        originY: y0,
        cornerRadii: { top_left: rTL, top_right: rTR, bottom_right: rBR, bottom_left: rBL },
        chamferDist: ch,
        cornerSelector,
      },
    };
  }

  /**
   * Calcula os centros e raios exatos de um grupo de furação em uma chapa.
   */
  public static computeHoleGroupCandidates(
    origin: Vec2,
    width: number,
    height: number,
    group: {
      distribution: HoleDistributionMode;
      linearFormula?: LinearHoleFormulaMode;
      measurementMode?: DistanceMeasurementMode;
      count: number;
      diameter: number;
      margin?: number;
      marginY?: number;
      pitch?: number;
      spanLength?: number;
      pcd?: number;
      startAngleDeg?: number;
    },
  ): { holes: HoleCandidate[]; computedPitch?: number } {
    const r = Math.max(0.25, group.diameter / 2);
    const mode = group.measurementMode ?? "center_to_edge";
    const rawMargin = group.margin ?? 25;
    // Se a medida informada pelo usuário foi "borda externa do furo à borda da chapa",
    // a distância do centro à borda é m_center = m_edge + r.
    const effMarginX = mode === "outer_edge_to_edge" ? rawMargin + r : rawMargin;
    const rawMarginY = group.marginY ?? rawMargin;
    const effMarginY = mode === "outer_edge_to_edge" ? rawMarginY + r : rawMarginY;

    const x0 = origin.x;
    const y0 = origin.y;
    const cx = x0 + width / 2;
    const cy = y0 + height / 2;

    switch (group.distribution) {
      case "none":
        return { holes: [] };

      case "single_center":
        return {
          holes: [{ id: uid(), cx, cy, r }],
        };

      case "single_offset":
        return {
          holes: [
            {
              id: uid(),
              cx: x0 + effMarginX,
              cy: y0 + effMarginY,
              r,
            },
          ],
        };

      case "corner_margins": {
        const centers: Vec2[] = [
          { x: x0 + effMarginX, y: y0 + effMarginY },
          { x: x0 + width - effMarginX, y: y0 + effMarginY },
          { x: x0 + width - effMarginX, y: y0 + height - effMarginY },
          { x: x0 + effMarginX, y: y0 + height - effMarginY },
        ];
        return {
          holes: centers.slice(0, Math.max(1, group.count || 4)).map((c) => ({
            id: uid(),
            cx: Number(c.x.toFixed(4)),
            cy: Number(c.y.toFixed(4)),
            r,
          })),
        };
      }

      case "grid_4_plus_center": {
        const centers: Vec2[] = [
          { x: x0 + effMarginX, y: y0 + effMarginY },
          { x: x0 + width - effMarginX, y: y0 + effMarginY },
          { x: x0 + width - effMarginX, y: y0 + height - effMarginY },
          { x: x0 + effMarginX, y: y0 + height - effMarginY },
          { x: cx, y: cy },
        ];
        return {
          holes: centers.map((c) => ({
            id: uid(),
            cx: Number(c.x.toFixed(4)),
            cy: Number(c.y.toFixed(4)),
            r,
          })),
        };
      }

      case "linear_centerline_x": {
        const n = Math.max(1, group.count);
        const formula = group.linearFormula ?? "equal_subdivision_including_borders";

        if (group.pitch && group.pitch > 0 && n >= 2) {
          const totalSpan = group.pitch * (n - 1);
          const startX = cx - totalSpan / 2;
          return {
            computedPitch: group.pitch,
            holes: Array.from({ length: n }, (_, i) => ({
              id: uid(),
              cx: Number((startX + i * group.pitch!).toFixed(4)),
              cy: Number(cy.toFixed(4)),
              r,
            })),
          };
        }

        if (formula === "pitch_between_extremes" && group.spanLength && group.spanLength > 0) {
          const startX = cx - group.spanLength / 2;
          const { positions, pitch } =
            ChamferGeometricExecutionEngine.computeLinearPositionsFromSpan(
              startX,
              group.spanLength,
              n,
            );
          return {
            computedPitch: pitch,
            holes: positions.map((px) => ({
              id: uid(),
              cx: Number(px.toFixed(4)),
              cy: Number(cy.toFixed(4)),
              r,
            })),
          };
        }

        if (formula === "margin_plus_equal_pitch") {
          const { positions, pitch } =
            ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
              x0,
              width,
              effMarginX,
              n,
            );
          return {
            computedPitch: pitch,
            holes: positions.map((px) => ({
              id: uid(),
              cx: Number(px.toFixed(4)),
              cy: Number(cy.toFixed(4)),
              r,
            })),
          };
        }

        // Padrão: subdivisão igual incluindo as bordas p = W / (N + 1)
        const { positions, pitch } =
          ChamferGeometricExecutionEngine.computeLinearPositionsEqualSubdivision(x0, width, n);
        return {
          computedPitch: pitch,
          holes: positions.map((px) => ({
            id: uid(),
            cx: Number(px.toFixed(4)),
            cy: Number(cy.toFixed(4)),
            r,
          })),
        };
      }

      case "linear_centerline_y": {
        const n = Math.max(1, group.count);
        const formula = group.linearFormula ?? "equal_subdivision_including_borders";

        if (group.pitch && group.pitch > 0 && n >= 2) {
          const totalSpan = group.pitch * (n - 1);
          const startY = cy - totalSpan / 2;
          return {
            computedPitch: group.pitch,
            holes: Array.from({ length: n }, (_, i) => ({
              id: uid(),
              cx: Number(cx.toFixed(4)),
              cy: Number((startY + i * group.pitch!).toFixed(4)),
              r,
            })),
          };
        }

        if (formula === "margin_plus_equal_pitch") {
          const { positions, pitch } =
            ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
              y0,
              height,
              effMarginY,
              n,
            );
          return {
            computedPitch: pitch,
            holes: positions.map((py) => ({
              id: uid(),
              cx: Number(cx.toFixed(4)),
              cy: Number(py.toFixed(4)),
              r,
            })),
          };
        }

        const { positions, pitch } =
          ChamferGeometricExecutionEngine.computeLinearPositionsEqualSubdivision(y0, height, n);
        return {
          computedPitch: pitch,
          holes: positions.map((py) => ({
            id: uid(),
            cx: Number(cx.toFixed(4)),
            cy: Number(py.toFixed(4)),
            r,
          })),
        };
      }

      case "circular_pcd": {
        const pcd = group.pcd ?? Math.min(width, height) * 0.6;
        const centers = ChamferGeometricExecutionEngine.computeCircularPcdCenters(
          { x: cx, y: cy },
          pcd,
          group.count,
          group.startAngleDeg ?? 0,
        );
        return {
          holes: centers.map((c) => ({
            id: uid(),
            cx: c.x,
            cy: c.y,
            r,
          })),
        };
      }

      default:
        return { holes: [] };
    }
  }

  /**
   * Compila uma peça do tipo Chapa Paramétrica em Entidades Nativas + Cotas + Estado Paramétrico.
   */
  public static compileParametricPlate(params: {
    partId?: string;
    origin?: Vec2;
    width: number;
    height: number;
    cornerRadii: ParametricCornerRadii;
    cornerChamfer?: number;
    cornerSelector: CornerSelector;
    holeGroup?: Omit<ParametricHoleGroup, "entityIds">;
    includeCenterlines?: boolean;
    includeDimensions?: boolean;
    layer?: LayerId;
    turnIndex?: number;
  }): {
    entities: Entity[];
    dimensions: Dimension[];
    holes: HoleCandidate[];
    featureState: ParametricFeatureState;
  } {
    const partId = params.partId ?? `plate_${uid()}`;
    const origin = params.origin ?? { x: 0, y: 0 };
    const layer = params.layer ?? "corte";
    const { width, height, cornerRadii, cornerSelector } = params;
    const entities: Entity[] = [];
    const dimensions: Dimension[] = [];

    // 1. Contorno externo da chapa
    const plateEntity = ChamferGeometricExecutionEngine.createPlateContourEntity(
      origin,
      width,
      height,
      cornerRadii,
      layer,
      params.cornerChamfer ?? 0,
      cornerSelector,
    );
    entities.push(plateEntity);

    // 2. Linhas de centro (camada 'referencia') se solicitado ou se houver furação central/PCD
    const centerlineEntityIds: string[] = [];
    if (params.includeCenterlines) {
      const cx = origin.x + width / 2;
      const cy = origin.y + height / 2;
      const clH: Entity = {
        id: uid(),
        layer: "referencia",
        type: "line",
        x1: origin.x - 10,
        y1: cy,
        x2: origin.x + width + 10,
        y2: cy,
        isConstruction: true,
      };
      const clV: Entity = {
        id: uid(),
        layer: "referencia",
        type: "line",
        x1: cx,
        y1: origin.y - 10,
        x2: cx,
        y2: origin.y + height + 10,
        isConstruction: true,
      };
      entities.push(clH, clV);
      centerlineEntityIds.push(clH.id, clV.id);
    }

    // 3. Furação paramétrica
    const holeGroups: ParametricHoleGroup[] = [];
    let compiledHoles: HoleCandidate[] = [];

    if (params.holeGroup && params.holeGroup.count > 0 && params.holeGroup.distribution !== "none") {
      const { holes, computedPitch } = ChamferGeometricExecutionEngine.computeHoleGroupCandidates(
        origin,
        width,
        height,
        params.holeGroup,
      );
      compiledHoles = holes;

      // Se for distribuição em PCD, adiciona o círculo de referência PCD
      if (params.holeGroup.distribution === "circular_pcd" && params.holeGroup.pcd) {
        const pcdCircle: Entity = {
          id: uid(),
          layer: "referencia",
          type: "circle",
          cx: origin.x + width / 2,
          cy: origin.y + height / 2,
          r: params.holeGroup.pcd / 2,
          isConstruction: true,
        };
        entities.push(pcdCircle);
        centerlineEntityIds.push(pcdCircle.id);
      }

      const holeEntityIds: string[] = [];
      for (const h of holes) {
        const holeEnt: Entity = {
          id: h.id,
          layer,
          type: "circle",
          cx: h.cx,
          cy: h.cy,
          r: h.r,
          params: {
            isParametricHole: true,
            parentPartId: partId,
            holeGroupId: params.holeGroup.id,
            diameter: h.r * 2,
          },
        };
        entities.push(holeEnt);
        holeEntityIds.push(holeEnt.id);
      }

      holeGroups.push({
        ...params.holeGroup,
        pitch: computedPitch ?? params.holeGroup.pitch,
        entityIds: holeEntityIds,
      });
    }

    // 4. Cotas técnicas associativas
    if (params.includeDimensions !== false) {
      dimensions.push(
        makeDimension(
          "horizontal",
          [
            { kind: "point", p: { x: origin.x, y: origin.y } },
            { kind: "point", p: { x: origin.x + width, y: origin.y } },
          ],
          28,
          { suffix: " mm" },
        ),
      );
      dimensions.push(
        makeDimension(
          "vertical",
          [
            { kind: "point", p: { x: origin.x, y: origin.y } },
            { kind: "point", p: { x: origin.x, y: origin.y + height } },
          ],
          28,
          { suffix: " mm" },
        ),
      );
    }

    const featureState: ParametricFeatureState = {
      partId,
      kind: "plate",
      origin,
      width,
      height,
      cornerRadii: { ...cornerRadii },
      cornerChamfer: params.cornerChamfer ?? 0,
      cornerSelector,
      contourEntityIds: [plateEntity.id],
      holeGroups,
      slotGroups: [],
      centerlineEntityIds,
      dimensionIds: dimensions.map((d) => d.id),
      allEntityIds: entities.map((e) => e.id),
      layer,
      lastUpdatedTurn: params.turnIndex ?? 1,
    };

    return { entities, dimensions, holes: compiledHoles, featureState };
  }

  /**
   * Compila um Flange Circular com PCD e N furos polares.
   */
  public static compileCircularFlange(params: {
    partId?: string;
    center?: Vec2;
    outerDiameter: number;
    innerDiameter: number;
    pcd: number;
    holeCount: number;
    holeDiameter: number;
    startAngleDeg?: number;
    layer?: LayerId;
    turnIndex?: number;
  }): {
    entities: Entity[];
    dimensions: Dimension[];
    featureState: ParametricFeatureState;
  } {
    const partId = params.partId ?? `flange_${uid()}`;
    const center = params.center ?? { x: 0, y: 0 };
    const layer = params.layer ?? "corte";
    const entities: Entity[] = [];
    const dimensions: Dimension[] = [];

    const outerCircle: Entity = {
      id: uid(),
      layer,
      type: "circle",
      cx: center.x,
      cy: center.y,
      r: params.outerDiameter / 2,
      params: { isFlangeOuter: true, parentPartId: partId },
    };
    entities.push(outerCircle);

    const contourIds = [outerCircle.id];

    if (params.innerDiameter > 0) {
      const innerCircle: Entity = {
        id: uid(),
        layer,
        type: "circle",
        cx: center.x,
        cy: center.y,
        r: params.innerDiameter / 2,
        params: { isFlangeInner: true, parentPartId: partId },
      };
      entities.push(innerCircle);
      contourIds.push(innerCircle.id);
    }

    const pcdCircle: Entity = {
      id: uid(),
      layer: "referencia",
      type: "circle",
      cx: center.x,
      cy: center.y,
      r: params.pcd / 2,
      isConstruction: true,
    };
    entities.push(pcdCircle);

    const holeCenters = ChamferGeometricExecutionEngine.computeCircularPcdCenters(
      center,
      params.pcd,
      params.holeCount,
      params.startAngleDeg ?? 0,
    );
    const holeR = params.holeDiameter / 2;
    const holeEntityIds: string[] = [];

    for (const c of holeCenters) {
      const holeEnt: Entity = {
        id: uid(),
        layer,
        type: "circle",
        cx: c.x,
        cy: c.y,
        r: holeR,
        params: {
          isParametricHole: true,
          parentPartId: partId,
          diameter: params.holeDiameter,
        },
      };
      entities.push(holeEnt);
      holeEntityIds.push(holeEnt.id);
    }

    dimensions.push(
      makeDimension("diameter", [{ kind: "entity", id: outerCircle.id }], 35, {
        suffix: " mm EXT",
      }),
    );

    const featureState: ParametricFeatureState = {
      partId,
      kind: "flange",
      origin: center,
      width: params.outerDiameter,
      height: params.outerDiameter,
      outerDiameter: params.outerDiameter,
      innerDiameter: params.innerDiameter,
      cornerRadii: { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 },
      cornerSelector: "none",
      contourEntityIds: contourIds,
      holeGroups: [
        {
          id: `hg_${uid()}`,
          distribution: "circular_pcd",
          linearFormula: "equal_subdivision_including_borders",
          measurementMode: "center_to_center",
          count: params.holeCount,
          diameter: params.holeDiameter,
          margin: (params.outerDiameter - params.pcd) / 2,
          pcd: params.pcd,
          startAngleDeg: params.startAngleDeg ?? 0,
          entityIds: holeEntityIds,
        },
      ],
      slotGroups: [],
      centerlineEntityIds: [pcdCircle.id],
      dimensionIds: dimensions.map((d) => d.id),
      allEntityIds: entities.map((e) => e.id),
      layer,
      lastUpdatedTurn: params.turnIndex ?? 1,
    };

    return { entities, dimensions, featureState };
  }

  /**
   * Compila um Suporte Mecânico com Rasgo Oblongo Central e Furos Laterais.
   */
  public static compileSlottedBracket(params: {
    width: number;
    height: number;
    cornerRadius?: number;
    slotLength: number;
    slotWidth: number;
    holeDiameter: number;
    holeMargin?: number;
    layer?: LayerId;
    turnIndex?: number;
  }): {
    entities: Entity[];
    dimensions: Dimension[];
    featureState: ParametricFeatureState;
  } {
    const partId = `bracket_${uid()}`;
    const origin = { x: 0, y: 0 };
    const layer = params.layer ?? "corte";
    const r = params.cornerRadius ?? 15;
    const radii = ChamferGeometricExecutionEngine.resolveCornerRadii(r, "all");

    const contour = ChamferGeometricExecutionEngine.createPlateContourEntity(
      origin,
      params.width,
      params.height,
      radii,
      layer,
    );

    const slotCenter = { x: params.width / 2, y: params.height / 2 };
    const slotEnt = createSlotPolyline(
      slotCenter,
      params.slotLength,
      params.slotWidth,
      0,
      layer,
    );

    const margin = params.holeMargin ?? 35;
    const holeR = params.holeDiameter / 2;
    const hLeft: Entity = {
      id: uid(),
      layer,
      type: "circle",
      cx: margin,
      cy: params.height / 2,
      r: holeR,
    };
    const hRight: Entity = {
      id: uid(),
      layer,
      type: "circle",
      cx: params.width - margin,
      cy: params.height / 2,
      r: holeR,
    };

    const entities: Entity[] = [contour, slotEnt, hLeft, hRight];
    const dimensions: Dimension[] = [
      makeDimension(
        "horizontal",
        [
          { kind: "point", p: { x: 0, y: 0 } },
          { kind: "point", p: { x: params.width, y: 0 } },
        ],
        25,
        { suffix: " mm" },
      ),
      makeDimension(
        "vertical",
        [
          { kind: "point", p: { x: 0, y: 0 } },
          { kind: "point", p: { x: 0, y: params.height } },
        ],
        25,
        { suffix: " mm" },
      ),
    ];

    const featureState: ParametricFeatureState = {
      partId,
      kind: "bracket",
      origin,
      width: params.width,
      height: params.height,
      cornerRadii: radii,
      cornerSelector: "all",
      contourEntityIds: [contour.id],
      holeGroups: [
        {
          id: `hg_${uid()}`,
          distribution: "linear_centerline_x",
          linearFormula: "margin_plus_equal_pitch",
          measurementMode: "center_to_edge",
          count: 2,
          diameter: params.holeDiameter,
          margin,
          entityIds: [hLeft.id, hRight.id],
        },
      ],
      slotGroups: [
        {
          id: `sg_${uid()}`,
          center: slotCenter,
          length: params.slotLength,
          width: params.slotWidth,
          angleDeg: 0,
          entityIds: [slotEnt.id],
        },
      ],
      centerlineEntityIds: [],
      dimensionIds: dimensions.map((d) => d.id),
      allEntityIds: entities.map((e) => e.id),
      layer,
      lastUpdatedTurn: params.turnIndex ?? 1,
    };

    return { entities, dimensions, featureState };
  }

  /**
   * Compila Planificação de Tronco de Cone (Caldeiraria).
   */
  public static compileTruncatedCone(params: {
    baseDiameter: number;
    topDiameter: number;
    height: number;
    divisions?: number;
  }): { entities: Entity[]; dimensions: Dimension[]; viewport: { x: number; y: number; width: number; height: number } } {
    const D = Math.max(params.baseDiameter, params.topDiameter);
    const d = Math.min(params.baseDiameter, params.topDiameter);
    const H = params.height;
    const R = D / 2;
    const r = d / 2;
    const g = Math.hypot(H, R - r);
    const R1 = (g * R) / Math.max(1e-3, R - r);
    const R2 = (g * r) / Math.max(1e-3, R - r);
    const thetaRad = (2 * Math.PI * R) / R1;

    const entities: Entity[] = [];
    entities.push({
      id: uid(),
      layer: "corte",
      type: "arc",
      cx: 0,
      cy: 0,
      r: R1,
      a0: 0,
      a1: thetaRad,
    });
    entities.push({
      id: uid(),
      layer: "corte",
      type: "arc",
      cx: 0,
      cy: 0,
      r: R2,
      a0: 0,
      a1: thetaRad,
    });
    entities.push({
      id: uid(),
      layer: "corte",
      type: "line",
      x1: R2,
      y1: 0,
      x2: R1,
      y2: 0,
    });
    entities.push({
      id: uid(),
      layer: "corte",
      type: "line",
      x1: R2 * Math.cos(thetaRad),
      y1: R2 * Math.sin(thetaRad),
      x2: R1 * Math.cos(thetaRad),
      y2: R1 * Math.sin(thetaRad),
    });

    const divs = params.divisions ?? 12;
    for (let i = 1; i < divs; i++) {
      const a = (i * thetaRad) / divs;
      entities.push({
        id: uid(),
        layer: "dobra",
        type: "line",
        x1: R2 * Math.cos(a),
        y1: R2 * Math.sin(a),
        x2: R1 * Math.cos(a),
        y2: R1 * Math.sin(a),
      });
    }

    return {
      entities,
      dimensions: [],
      viewport: { x: -R1, y: -R1, width: R1 * 2, height: R1 * 2 },
    };
  }

  /**
   * Compila Planificação de Transição Quadrado para Redondo usando o motor real de triangulação.
   */
  public static compileSquareToRound(params: {
    squareWidth: number;
    squareDepth?: number;
    roundDiameter: number;
    height: number;
    thickness?: number;
  }): { entities: Entity[]; dimensions: Dimension[]; viewport: { x: number; y: number; width: number; height: number } } {
    const res = calculateSquareToRound({
      baseA: params.squareWidth,
      baseB: params.squareDepth ?? params.squareWidth,
      topDiameter: params.roundDiameter,
      height: params.height,
      thickness: params.thickness ?? 3,
      offsetX: 0,
      offsetY: 0,
      divisions: 12,
      density: 7.85,
      strategy: "single",
    });

    const entities: Entity[] = [];
    if (res.development.outline.length >= 3) {
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: res.development.outline,
      });
    }
    for (const fl of res.development.foldLines) {
      entities.push({
        id: uid(),
        layer: "dobra",
        type: "line",
        x1: fl.a.x,
        y1: fl.a.y,
        x2: fl.b.x,
        y2: fl.b.y,
      });
    }

    const b = res.development.bounds;
    return {
      entities,
      dimensions: [],
      viewport: {
        x: b.minX,
        y: b.minY,
        width: Math.max(100, b.maxX - b.minX),
        height: Math.max(100, b.maxY - b.minY),
      },
    };
  }

  /**
   * Compila Planificação de Curva de Gomos usando o motor analítico de gomos.
   */
  public static compileSegmentedElbow(params: {
    diameter: number;
    bendRadius: number;
    angleDeg?: number;
    segments?: number;
  }): { entities: Entity[]; dimensions: Dimension[]; viewport: { x: number; y: number; width: number; height: number } } {
    const model = elbowModel({
      diameter: params.diameter,
      radius: params.bendRadius,
      angleDeg: params.angleDeg ?? 90,
      gores: params.segments ?? 4,
      divisions: 16,
    });

    const segDev = (model.segments[1] ?? model.segments[0])!.development;
    const entities: Entity[] = [];
    if (segDev.outline.length >= 3) {
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: segDev.outline,
      });
    }
    for (const fl of segDev.foldLines) {
      entities.push({
        id: uid(),
        layer: "dobra",
        type: "line",
        x1: fl.a.x,
        y1: fl.a.y,
        x2: fl.b.x,
        y2: fl.b.y,
      });
    }
    const b = segDev.bounds;
    return {
      entities,
      dimensions: [],
      viewport: {
        x: b.minX,
        y: b.minY,
        width: Math.max(100, b.maxX - b.minX),
        height: Math.max(100, b.maxY - b.minY),
      },
    };
  }

  /**
   * Compila Planificação de Derivação Cilíndrica / Boca de Lobo.
   */
  public static compileCylindricalBranch(params: {
    mainDiameter: number;
    branchDiameter: number;
    branchHeight?: number;
    angleDeg?: number;
  }): { entities: Entity[]; dimensions: Dimension[]; viewport: { x: number; y: number; width: number; height: number } } {
    const input = {
      mainDiameter: params.mainDiameter,
      branchDiameter: Math.min(params.branchDiameter, params.mainDiameter * 0.98),
      branchLength: params.branchHeight ?? 250,
      angleDeg: params.angleDeg ?? 90,
      offset: 0,
      divisions: 16,
    };
    const devs = branchDevelopments(input);
    const entities: Entity[] = [];
    if (devs.branch.outline.length >= 3) {
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: devs.branch.outline,
      });
    }
    for (const fl of devs.branch.foldLines) {
      entities.push({
        id: uid(),
        layer: "dobra",
        type: "line",
        x1: fl.a.x,
        y1: fl.a.y,
        x2: fl.b.x,
        y2: fl.b.y,
      });
    }
    const b = devs.branch.bounds;
    return {
      entities,
      dimensions: [],
      viewport: {
        x: b.minX,
        y: b.minY,
        width: Math.max(100, b.maxX - b.minX),
        height: Math.max(100, b.maxY - b.minY),
      },
    };
  }

  /**
   * Cria um Polígono Regular nativo.
   */
  public static compileRegularPolygon(params: {
    sides: number;
    radius: number;
    center?: Vec2;
    layer?: LayerId;
  }): Entity {
    return polygonEntity(
      params.center ?? { x: 0, y: 0 },
      params.radius,
      Math.max(3, Math.round(params.sides)),
      params.layer ?? "corte",
    );
  }
}
