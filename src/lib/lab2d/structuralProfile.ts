import type { Entity, Vec2 } from "@/lib/lab2d/core";
import {
  COSTA_FERRO_MATERIALS,
  findCostaFerroMaterial,
  type CostaFerroMaterialItem,
} from "@/lib/library/costaFerroCatalog";
import type {
  CadFaceGroup,
  CadPolylineEdge,
  CadTessellatedShape,
} from "@/lib/cad/core/CadMesh";
import type { CadVector3D } from "@/lib/cad/core/CadTopology";

export type StructuralProfileKind =
  | "chapa_plana"
  | "metalon_quadrado"
  | "metalon_retangular"
  | "tubo_redondo"
  | "cantoneira"
  | "perfil_u"
  | "barra_chata";

export type StructuralProfileAdaptationMode = "auto_drawing" | "bom_catalog";

export interface EntityStructuralProfile {
  kind: StructuralProfileKind;
  adaptationMode: StructuralProfileAdaptationMode;
  /** Quando ativo no modo Catálogo BOM, preserva a largura desenhada na vista 2D */
  lockDrawingWidth?: boolean;
  /** ID do material vinculado no Catálogo Costa Ferro BOM */
  catalogMaterialId?: string;
  /** Dimensão transversal B no plano 2D (mm) — ex: 70 para Metalão 70x70 */
  widthB: number;
  /** Altura vertical H no eixo Z 3D (mm) — ex: 70 para Metalão 70x70 */
  heightH: number;
  /** Espessura de parede e (mm) — ex: 2.00 */
  wallThicknessE: number;
  /** Comprimento longitudinal L da barra (mm) — ex: 630.00 */
  lengthL: number;
  /** Ângulo do eixo longitudinal no plano XY (radianos) */
  axisAngleRad: number;
  /** Peso linear (kg/m) */
  linearWeightKgM: number;
  /** Peso estimado da peça (kg) */
  estimatedWeightKg: number;
}

export interface StructuralBarGeometryAnalysis {
  isConvertible: boolean;
  center: Vec2;
  /** Vetor unitário ao longo do comprimento L (maior dimensão) */
  axisU: Vec2;
  /** Vetor unitário transversal ao longo da largura B (menor dimensão) */
  axisV: Vec2;
  /** Ângulo do eixo longitudinal em radianos */
  axisAngleRad: number;
  /** Comprimento longitudinal L detectado no desenho (mm) */
  lengthL: number;
  /** Largura transversal B detectada no desenho (mm) */
  drawnWidthB: number;
  /** Orientação legível */
  orientationLabel: "Horizontal (Eixo X)" | "Vertical (Eixo Y)" | "Inclinada";
}

export const STRUCTURAL_PROFILE_KIND_META: Record<
  StructuralProfileKind,
  {
    label: string;
    shortLabel: string;
    symbol: string;
    isHollow: boolean;
  }
> = {
  chapa_plana: {
    label: "Chapa Plana (Padrão)",
    shortLabel: "Chapa Plana",
    symbol: "▭",
    isHollow: false,
  },
  metalon_quadrado: {
    label: "Metalão Quadrado",
    shortLabel: "Metalão Quadrado",
    symbol: "⬜",
    isHollow: true,
  },
  metalon_retangular: {
    label: "Metalão Retangular",
    shortLabel: "Metalão Retang.",
    symbol: "▭",
    isHollow: true,
  },
  tubo_redondo: {
    label: "Tubo Industrial Redondo",
    shortLabel: "Tubo Redondo",
    symbol: "◯",
    isHollow: true,
  },
  cantoneira: {
    label: "Cantoneira",
    shortLabel: "Cantoneira",
    symbol: "∟",
    isHollow: false,
  },
  perfil_u: {
    label: "Perfil U",
    shortLabel: "Perfil U",
    symbol: "⊏",
    isHollow: false,
  },
  barra_chata: {
    label: "Barra Chata",
    shortLabel: "Barra Chata",
    symbol: "▬",
    isHollow: false,
  },
};

export const STANDARD_METALON_SQUARE_SECTIONS_MM: number[] = [
  15, 20, 25, 30, 40, 50, 60, 70, 80, 100,
];

export const STANDARD_METALON_WALL_THICKNESSES_MM: number[] = [
  1.2, 1.5, 2.0, 2.65, 3.0, 4.75,
];

/**
 * Retorna os itens do Catálogo Costa Ferro BOM filtrados pelo tipo de perfil estrutural.
 */
export function getCatalogItemsForProfileKind(
  kind: StructuralProfileKind,
): CostaFerroMaterialItem[] {
  switch (kind) {
    case "metalon_quadrado":
      return COSTA_FERRO_MATERIALS.filter(
        (m) => m.category === "TUBO_QUADRADO_METALON" && m.finish === "Preto",
      );
    case "metalon_retangular":
      return COSTA_FERRO_MATERIALS.filter(
        (m) => m.category === "TUBO_RETANGULAR_METALON",
      );
    case "tubo_redondo":
      return COSTA_FERRO_MATERIALS.filter(
        (m) => m.category === "TUBO_REDONDO_INDUSTRIAL",
      );
    case "cantoneira":
      return COSTA_FERRO_MATERIALS.filter(
        (m) =>
          m.category === "CANTONEIRA_BARRA" &&
          m.subcategory.toLowerCase().includes("cantoneira"),
      );
    case "perfil_u":
      return COSTA_FERRO_MATERIALS.filter(
        (m) =>
          m.category === "PERFIL_ESTRUTURAL" &&
          m.subcategory.toLowerCase().includes("perfil u"),
      );
    case "barra_chata":
      return COSTA_FERRO_MATERIALS.filter(
        (m) =>
          m.category === "CANTONEIRA_BARRA" &&
          m.subcategory.toLowerCase().includes("barra chata"),
      );
    default:
      return [];
  }
}

/**
 * Calcula o peso linear (kg/m) real a partir do Catálogo Costa Ferro BOM ou,
 * para medidas auto-adaptadas fora de bitola comercial, pela área de aço (7,85 g/cm³).
 */
export function computeProfileLinearWeightKgM(
  kind: StructuralProfileKind,
  widthB: number,
  heightH: number,
  wallThicknessE: number,
  catalogMaterialId?: string,
): { linearWeightKgM: number; matchedCatalogItem?: CostaFerroMaterialItem } {
  const b = Math.max(1, Number(widthB) || 0);
  const h = Math.max(1, Number(heightH) || b);
  const e = Math.max(0.5, Math.min(Number(wallThicknessE) || 2.0, Math.min(b, h) * 0.45));

  if (catalogMaterialId) {
    const byId = findCostaFerroMaterial(catalogMaterialId);
    if (byId && byId.linearWeightKgM) {
      return { linearWeightKgM: byId.linearWeightKgM, matchedCatalogItem: byId };
    }
  }

  const catalogList = getCatalogItemsForProfileKind(kind);
  const matched = catalogList.find((item) => {
    const itemW = item.widthMm ?? item.diameterMm ?? 0;
    const itemH = item.heightMm ?? item.diameterMm ?? itemW;
    const itemE = item.wallThicknessMm ?? 0;
    const sameSection =
      (Math.abs(itemW - b) < 0.35 && Math.abs(itemH - h) < 0.35) ||
      (Math.abs(itemW - h) < 0.35 && Math.abs(itemH - b) < 0.35);
    const sameWall = Math.abs(itemE - e) < 0.15;
    return sameSection && sameWall;
  });

  if (matched?.linearWeightKgM) {
    return { linearWeightKgM: matched.linearWeightKgM, matchedCatalogItem: matched };
  }

  // Cálculo analítico metalúrgico (densidade do aço carbono = 7,85 kg/dm³ = 0,00785 kg/(mm²·m))
  const STEEL_DENSITY_FACTOR = 0.00785;
  let areaMm2 = 0;

  if (kind === "metalon_quadrado" || kind === "metalon_retangular") {
    const innerW = Math.max(0, b - 2 * e);
    const innerH = Math.max(0, h - 2 * e);
    areaMm2 = b * h - innerW * innerH;
  } else if (kind === "tubo_redondo") {
    const rOuter = b / 2;
    const rInner = Math.max(0, rOuter - e);
    areaMm2 = Math.PI * (rOuter * rOuter - rInner * rInner);
  } else if (kind === "cantoneira") {
    areaMm2 = (b + h - e) * e;
  } else if (kind === "perfil_u") {
    areaMm2 = h * e + 2 * Math.max(0, b - e) * e;
  } else if (kind === "barra_chata") {
    areaMm2 = b * e;
  } else {
    areaMm2 = b * e;
  }

  const linearWeightKgM = Math.max(0.05, +(areaMm2 * STEEL_DENSITY_FACTOR).toFixed(2));
  return { linearWeightKgM, matchedCatalogItem: undefined };
}

/**
 * Extrai o perfil estrutural ativo de uma entidade do CHAMFER CAD (se houver).
 */
export function getEntityStructuralProfile(
  entity: Entity | null | undefined,
): EntityStructuralProfile | null {
  if (!entity) return null;
  const direct = entity.structuralProfile;
  if (direct && direct.kind && direct.kind !== "chapa_plana") {
    return direct;
  }
  const fromParams = entity.params?.structuralProfile as EntityStructuralProfile | undefined;
  if (fromParams && fromParams.kind && fromParams.kind !== "chapa_plana") {
    return fromParams;
  }
  return null;
}

/**
 * Verifica se a entidade pode ser convertida/configurada como Perfil Estrutural (Metalão/Tubo/etc.).
 * Suporta retângulos/polilinhas fechadas e linhas.
 */
export function canEntityHaveStructuralProfile(
  entity: Entity | null | undefined,
): boolean {
  if (!entity || entity.isConstruction) return false;
  if (entity.type === "polyline") {
    return entity.pts.length >= 3;
  }
  if (entity.type === "line") {
    return true;
  }
  return false;
}

const barGeometryAnalysisCache = new WeakMap<Entity, StructuralBarGeometryAnalysis | null>();

/**
 * Analisa a geometria 2D da entidade selecionada (horizontal, vertical ou inclinada em qualquer ângulo θ),
 * identificando automaticamente o eixo longitudinal L (maior lado) e a seção transversal B (menor lado).
 * Memoizado via WeakMap por referência imutável de `Entity` (custo O(1) durante redraws de 60fps).
 */
export function analyzeEntityBarGeometry(
  entity: Entity | null | undefined,
): StructuralBarGeometryAnalysis | null {
  if (!entity) return null;
  if (barGeometryAnalysisCache.has(entity)) {
    return barGeometryAnalysisCache.get(entity) ?? null;
  }
  const computed = computeEntityBarGeometryUncached(entity);
  barGeometryAnalysisCache.set(entity, computed);
  return computed;
}

function computeEntityBarGeometryUncached(
  entity: Entity,
): StructuralBarGeometryAnalysis | null {

  if (entity.type === "line") {
    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return null;
    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;
    const angle = Math.atan2(uy, ux);
    const existing = getEntityStructuralProfile(entity);
    const drawnB = existing?.widthB ?? 40;
    const absCos = Math.abs(ux);
    const absSin = Math.abs(uy);
    const orientationLabel =
      absCos > 0.98
        ? "Horizontal (Eixo X)"
        : absSin > 0.98
          ? "Vertical (Eixo Y)"
          : "Inclinada";

    return {
      isConvertible: true,
      center: { x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2 },
      axisU: { x: ux, y: uy },
      axisV: { x: vx, y: vy },
      axisAngleRad: angle,
      lengthL: +len.toFixed(2),
      drawnWidthB: +drawnB.toFixed(2),
      orientationLabel,
    };
  }

  if (entity.type === "polyline" && entity.pts.length >= 3) {
    const pts = entity.pts;
    // Remove vértice duplicado caso o último ponto repita o primeiro
    const cleanPts =
      pts.length > 3 &&
      Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < 1e-3
        ? pts.slice(0, -1)
        : pts;

    // Caso clássico: Retângulo / Polilinha de 4 vértices (horizontal, vertical ou rotacionada em θ)
    if (cleanPts.length === 4) {
      const p0 = cleanPts[0];
      const p1 = cleanPts[1];
      const p2 = cleanPts[2];
      const p3 = cleanPts[3];

      const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
      const cy = (p0.y + p1.y + p2.y + p3.y) / 4;

      const e0x = p1.x - p0.x;
      const e0y = p1.y - p0.y;
      const len0 = Math.hypot(e0x, e0y);

      const e1x = p2.x - p1.x;
      const e1y = p2.y - p1.y;
      const len1 = Math.hypot(e1x, e1y);

      if (len0 > 1e-3 && len1 > 1e-3) {
        let ux: number;
        let uy: number;
        let lengthL: number;
        let drawnWidthB: number;

        if (len0 >= len1) {
          ux = e0x / len0;
          uy = e0y / len0;
          lengthL = (len0 + Math.hypot(p3.x - p2.x, p3.y - p2.y)) / 2;
          drawnWidthB = (len1 + Math.hypot(p0.x - p3.x, p0.y - p3.y)) / 2;
        } else {
          ux = e1x / len1;
          uy = e1y / len1;
          lengthL = (len1 + Math.hypot(p0.x - p3.x, p0.y - p3.y)) / 2;
          drawnWidthB = (len0 + Math.hypot(p3.x - p2.x, p3.y - p2.y)) / 2;
        }

        // Normaliza sentido do vetor longitudinal para manter consistência [-pi/2, pi/2]
        if (ux < -1e-5 || (Math.abs(ux) <= 1e-5 && uy < 0)) {
          ux = -ux;
          uy = -uy;
        }

        const vx = -uy;
        const vy = ux;
        const angle = Math.atan2(uy, ux);
        const absCos = Math.abs(ux);
        const absSin = Math.abs(uy);
        const orientationLabel =
          absCos > 0.98
            ? "Horizontal (Eixo X)"
            : absSin > 0.98
              ? "Vertical (Eixo Y)"
              : "Inclinada";

        return {
          isConvertible: true,
          center: { x: cx, y: cy },
          axisU: { x: ux, y: uy },
          axisV: { x: vx, y: vy },
          axisAngleRad: angle,
          lengthL: +Math.max(1, lengthL).toFixed(2),
          drawnWidthB: +Math.max(1, drawnWidthB).toFixed(2),
          orientationLabel,
        };
      }
    }

    // Fallback para polilinhas gerais: encontra a maior aresta para orientar o OBB ou usa AABB
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of cleanPts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const wX = Math.max(1, maxX - minX);
    const hY = Math.max(1, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    if (wX >= hY) {
      return {
        isConvertible: true,
        center: { x: cx, y: cy },
        axisU: { x: 1, y: 0 },
        axisV: { x: 0, y: 1 },
        axisAngleRad: 0,
        lengthL: +wX.toFixed(2),
        drawnWidthB: +hY.toFixed(2),
        orientationLabel: "Horizontal (Eixo X)",
      };
    } else {
      return {
        isConvertible: true,
        center: { x: cx, y: cy },
        axisU: { x: 0, y: 1 },
        axisV: { x: -1, y: 0 },
        axisAngleRad: Math.PI / 2,
        lengthL: +hY.toFixed(2),
        drawnWidthB: +wX.toFixed(2),
        orientationLabel: "Vertical (Eixo Y)",
      };
    }
  }

  return null;
}

/**
 * Reconstrói os 4 vértices de um retângulo (polilinha de 4 pontos) preservando seu centro,
 * comprimento L e ângulo de inclinação θ, ajustando sua largura transversal para targetWidthB.
 */
export function reshapeRectangleTransverseWidth(
  entity: Entity,
  targetWidthB: number,
  targetLengthL?: number,
): Entity {
  if (entity.type !== "polyline") return entity;
  const geom = analyzeEntityBarGeometry(entity);
  if (!geom) return entity;

  const L = Math.max(1, targetLengthL ?? geom.lengthL);
  const B = Math.max(1, targetWidthB);
  const halfL = L / 2;
  const halfB = B / 2;
  const { center, axisU, axisV } = geom;

  const nextPts: Vec2[] = [
    {
      x: +(center.x - axisU.x * halfL - axisV.x * halfB).toFixed(4),
      y: +(center.y - axisU.y * halfL - axisV.y * halfB).toFixed(4),
    },
    {
      x: +(center.x + axisU.x * halfL - axisV.x * halfB).toFixed(4),
      y: +(center.y + axisU.y * halfL - axisV.y * halfB).toFixed(4),
    },
    {
      x: +(center.x + axisU.x * halfL + axisV.x * halfB).toFixed(4),
      y: +(center.y + axisU.y * halfL + axisV.y * halfB).toFixed(4),
    },
    {
      x: +(center.x - axisU.x * halfL + axisV.x * halfB).toFixed(4),
      y: +(center.y - axisU.y * halfL + axisV.y * halfB).toFixed(4),
    },
  ];

  return {
    ...entity,
    closed: true,
    pts: nextPts,
  };
}

/**
 * Constrói e aplica o perfil estrutural em uma entidade 2D, adaptando automaticamente ao tamanho
 * desenhado (`auto_drawing`) ou aplicando uma bitola do Catálogo BOM (`bom_catalog`).
 */
export function applyStructuralProfileToEntity(
  entity: Entity,
  options: {
    kind: StructuralProfileKind;
    adaptationMode?: StructuralProfileAdaptationMode;
    widthB?: number;
    heightH?: number;
    wallThicknessE?: number;
    catalogMaterialId?: string;
    lockDrawingWidth?: boolean;
  },
): Entity {
  if (options.kind === "chapa_plana") {
    const nextParams = { ...(entity.params ?? {}) };
    delete nextParams.structuralProfile;
    const cleaned: Entity = {
      ...entity,
      structuralProfile: undefined,
      params: Object.keys(nextParams).length > 0 ? nextParams : undefined,
    };
    return cleaned;
  }

  const geom = analyzeEntityBarGeometry(entity);
  if (!geom) return entity;

  const prev = getEntityStructuralProfile(entity);
  const adaptationMode: StructuralProfileAdaptationMode =
    options.adaptationMode ?? prev?.adaptationMode ?? "auto_drawing";
  const lockDrawingWidth =
    options.lockDrawingWidth ?? prev?.lockDrawingWidth ?? false;

  let widthB = geom.drawnWidthB;
  let heightH = geom.drawnWidthB;
  let wallThicknessE = options.wallThicknessE ?? prev?.wallThicknessE ?? 2.0;
  let catalogMaterialId = options.catalogMaterialId;

  if (adaptationMode === "auto_drawing") {
    // Opção 1: Auto-Adaptar ao Desenho (preserva maior lado como L e menor lado como B × B)
    widthB = +(options.widthB ?? geom.drawnWidthB).toFixed(2);
    heightH =
      options.kind === "metalon_quadrado" || options.kind === "tubo_redondo" || options.kind === "cantoneira"
        ? widthB
        : +(options.heightH ?? prev?.heightH ?? widthB).toFixed(2);
  } else {
    // Opção 2: Catálogo Padrão BOM
    if (catalogMaterialId) {
      const catItem = findCostaFerroMaterial(catalogMaterialId);
      if (catItem) {
        widthB = catItem.widthMm ?? catItem.diameterMm ?? geom.drawnWidthB;
        heightH = catItem.heightMm ?? catItem.diameterMm ?? widthB;
        wallThicknessE = catItem.wallThicknessMm ?? wallThicknessE;
      }
    } else {
      const targetB = options.widthB ?? prev?.widthB ?? findNearestStandardSquareSection(geom.drawnWidthB);
      widthB = +targetB.toFixed(2);
      heightH =
        options.kind === "metalon_quadrado" || options.kind === "tubo_redondo" || options.kind === "cantoneira"
          ? widthB
          : +(options.heightH ?? prev?.heightH ?? widthB).toFixed(2);
    }
  }

  // Garante espessura de parede física válida para a seção
  const maxAllowedWall = Math.max(0.8, +(Math.min(widthB, heightH) * 0.4).toFixed(2));
  wallThicknessE = Math.min(Math.max(0.8, wallThicknessE), maxAllowedWall);

  // Ajusta a largura transversal do desenho 2D caso esteja no modo Catálogo BOM (e não travado)
  let updatedEntity = entity;
  if (
    entity.type === "polyline" &&
    ((adaptationMode === "bom_catalog" && !lockDrawingWidth) ||
      (options.widthB !== undefined && !lockDrawingWidth))
  ) {
    if (Math.abs(geom.drawnWidthB - widthB) > 0.05) {
      updatedEntity = reshapeRectangleTransverseWidth(entity, widthB, geom.lengthL);
    }
  }

  const finalGeom = analyzeEntityBarGeometry(updatedEntity) ?? geom;
  const lengthL = finalGeom.lengthL;

  const { linearWeightKgM, matchedCatalogItem } = computeProfileLinearWeightKgM(
    options.kind,
    widthB,
    heightH,
    wallThicknessE,
    catalogMaterialId,
  );

  const estimatedWeightKg = +((linearWeightKgM * lengthL) / 1000).toFixed(3);

  const profile: EntityStructuralProfile = {
    kind: options.kind,
    adaptationMode,
    lockDrawingWidth,
    catalogMaterialId: matchedCatalogItem?.id ?? catalogMaterialId,
    widthB: +widthB.toFixed(2),
    heightH: +heightH.toFixed(2),
    wallThicknessE: +wallThicknessE.toFixed(2),
    lengthL: +lengthL.toFixed(2),
    axisAngleRad: finalGeom.axisAngleRad,
    linearWeightKgM,
    estimatedWeightKg,
  };

  return {
    ...updatedEntity,
    structuralProfile: profile,
    params: {
      ...(updatedEntity.params ?? {}),
      structuralProfile: profile,
    },
  };
}

/**
 * Encontra a bitola quadrada comercial mais próxima no catálogo BOM para inicializar o modo Catálogo.
 */
export function findNearestStandardSquareSection(drawnWidthMm: number): number {
  let best = STANDARD_METALON_SQUARE_SECTIONS_MM[0];
  let bestDiff = Math.abs(drawnWidthMm - best);
  for (const s of STANDARD_METALON_SQUARE_SECTIONS_MM) {
    const d = Math.abs(drawnWidthMm - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Sincroniza bidirecionalmente o perfil estrutural quando o usuário edita Largura (X), Altura (Y)
 * ou escala a peça diretamente no cartão "DIMENSÕES DO CONTORNO" ou no canvas.
 */
export function syncStructuralProfileOnGeometryChange(entity: Entity): Entity {
  const existing = getEntityStructuralProfile(entity);
  if (!existing) return entity;

  const geom = analyzeEntityBarGeometry(entity);
  if (!geom) return entity;

  const nextWidthB = +geom.drawnWidthB.toFixed(2);
  const nextHeightH =
    existing.kind === "metalon_quadrado" ||
    existing.kind === "tubo_redondo" ||
    existing.kind === "cantoneira"
      ? nextWidthB
      : existing.heightH;
  const nextLengthL = +geom.lengthL.toFixed(2);

  const maxAllowedWall = Math.max(0.8, +(Math.min(nextWidthB, nextHeightH) * 0.4).toFixed(2));
  const wallThicknessE = Math.min(existing.wallThicknessE, maxAllowedWall);

  const { linearWeightKgM, matchedCatalogItem } = computeProfileLinearWeightKgM(
    existing.kind,
    nextWidthB,
    nextHeightH,
    wallThicknessE,
    existing.adaptationMode === "bom_catalog" ? existing.catalogMaterialId : undefined,
  );

  const estimatedWeightKg = +((linearWeightKgM * nextLengthL) / 1000).toFixed(3);

  const updatedProfile: EntityStructuralProfile = {
    ...existing,
    widthB: nextWidthB,
    heightH: nextHeightH,
    wallThicknessE: +wallThicknessE.toFixed(2),
    lengthL: nextLengthL,
    axisAngleRad: geom.axisAngleRad,
    catalogMaterialId: matchedCatalogItem?.id,
    linearWeightKgM,
    estimatedWeightKg,
  };

  return {
    ...entity,
    structuralProfile: updatedProfile,
    params: {
      ...(entity.params ?? {}),
      structuralProfile: updatedProfile,
    },
  };
}

/**
 * Formata o rótulo técnico exibido na linha "Fechamento" do cartão DIMENSÕES DO CONTORNO
 * (ex: "Metalão Quadrado 70×70×2.0mm").
 */
export function formatStructuralProfileClosureLabel(
  profile: EntityStructuralProfile,
): string {
  const bStr = Number.isInteger(profile.widthB)
    ? `${profile.widthB}`
    : profile.widthB.toFixed(1);
  const hStr = Number.isInteger(profile.heightH)
    ? `${profile.heightH}`
    : profile.heightH.toFixed(1);
  const eStr =
    profile.wallThicknessE % 1 === 0
      ? profile.wallThicknessE.toFixed(1)
      : Number(profile.wallThicknessE.toFixed(2)).toString();

  switch (profile.kind) {
    case "metalon_quadrado":
      return `Metalão Quadrado ${bStr}×${bStr}×${eStr}mm`;
    case "metalon_retangular":
      return `Metalão Retang. ${hStr}×${bStr}×${eStr}mm`;
    case "tubo_redondo":
      return `Tubo Redondo Ø${bStr}×${eStr}mm`;
    case "cantoneira":
      return `Cantoneira ${bStr}×${bStr}×${eStr}mm`;
    case "perfil_u":
      return `Perfil U ${hStr}×${bStr}×${eStr}mm`;
    case "barra_chata":
      return `Barra Chata ${bStr}×${eStr}mm`;
    default:
      return "Fechada (Chapa/Loop)";
  }
}

/**
 * Formata o selo técnico compacto exibido no centro da barra quando selecionada no 2D SKETCH
 * (ex: "⬜ 70×70×2.0").
 */
export function formatStructuralProfileCenterBadge(
  profile: EntityStructuralProfile,
): string {
  const meta = STRUCTURAL_PROFILE_KIND_META[profile.kind];
  const bStr = Number.isInteger(profile.widthB)
    ? `${profile.widthB}`
    : profile.widthB.toFixed(1);
  const hStr = Number.isInteger(profile.heightH)
    ? `${profile.heightH}`
    : profile.heightH.toFixed(1);
  const eStr =
    profile.wallThicknessE % 1 === 0
      ? profile.wallThicknessE.toFixed(1)
      : Number(profile.wallThicknessE.toFixed(2)).toString();

  if (profile.kind === "metalon_quadrado") {
    return `${meta.symbol} ${bStr}×${bStr}×${eStr}`;
  }
  if (profile.kind === "tubo_redondo") {
    return `${meta.symbol} Ø${bStr}×${eStr}`;
  }
  if (profile.kind === "barra_chata") {
    return `${meta.symbol} ${bStr}×${eStr}`;
  }
  return `${meta.symbol} ${hStr}×${bStr}×${eStr}`;
}

/**
 * Calcula as duas linhas tracejadas paralelas internas (offset = espessura da parede `e`)
 * para representação técnica de tubo oco na vista de topo do modo 2D SKETCH.
 */
export function computeStructuralProfile2DInnerWallLines(
  entity: Entity,
): {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  center: Vec2;
  axisAngleRad: number;
  badgeText: string;
} | null {
  const profile = getEntityStructuralProfile(entity);
  if (!profile) return null;
  const geom = analyzeEntityBarGeometry(entity);
  if (!geom) return null;

  const B = geom.drawnWidthB;
  const L = geom.lengthL;
  // Para visualização técnica nítida em qualquer escala, garante que o offset visual seja visível
  // mas respeite a espessura real `e` da parede do tubo.
  const realE = Math.min(profile.wallThicknessE, B * 0.42);
  const halfL = L / 2;
  const halfInnerB = Math.max(0.5, B / 2 - realE);

  const { center, axisU, axisV } = geom;
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  if (
    profile.kind === "metalon_quadrado" ||
    profile.kind === "metalon_retangular" ||
    profile.kind === "tubo_redondo" ||
    profile.kind === "perfil_u"
  ) {
    // Parede interna lateral 1 (+halfInnerB)
    lines.push({
      x1: center.x - axisU.x * halfL + axisV.x * halfInnerB,
      y1: center.y - axisU.y * halfL + axisV.y * halfInnerB,
      x2: center.x + axisU.x * halfL + axisV.x * halfInnerB,
      y2: center.y + axisU.y * halfL + axisV.y * halfInnerB,
    });
    // Parede interna lateral 2 (-halfInnerB)
    lines.push({
      x1: center.x - axisU.x * halfL - axisV.x * halfInnerB,
      y1: center.y - axisU.y * halfL - axisV.y * halfInnerB,
      x2: center.x + axisU.x * halfL - axisV.x * halfInnerB,
      y2: center.y + axisU.y * halfL - axisV.y * halfInnerB,
    });
  } else if (profile.kind === "cantoneira") {
    // Aba interna da cantoneira (1 linha tracejada na espessura da aba)
    lines.push({
      x1: center.x - axisU.x * halfL - axisV.x * halfInnerB,
      y1: center.y - axisU.y * halfL - axisV.y * halfInnerB,
      x2: center.x + axisU.x * halfL - axisV.x * halfInnerB,
      y2: center.y + axisU.y * halfL - axisV.y * halfInnerB,
    });
  }

  return {
    lines,
    center,
    axisAngleRad: geom.axisAngleRad,
    badgeText: formatStructuralProfileCenterBadge(profile),
  };
}

/**
 * Gera a seção transversal 2D (no referencial local [v, z] onde v ∈ [-B/2, +B/2] e z ∈ [0, H])
 * para construção da malha 3D tubular oca real com chanfro/raio sutil nas quinas externas
 * e cavidade vazada passante de ponta a ponta.
 */
function buildHollowCrossSectionRings(
  profile: EntityStructuralProfile,
  drawnWidthB: number,
): {
  outerRing: Array<{ v: number; z: number }>;
  innerRing: Array<{ v: number; z: number }> | null;
} {
  const B = Math.max(2, drawnWidthB || profile.widthB);
  const H =
    profile.kind === "metalon_quadrado" ||
    profile.kind === "tubo_redondo" ||
    profile.kind === "cantoneira"
      ? B
      : Math.max(2, profile.heightH || B);
  const e = Math.max(0.8, Math.min(profile.wallThicknessE || 2.0, Math.min(B, H) * 0.42));
  const halfB = B / 2;

  if (profile.kind === "tubo_redondo") {
    const segs = 24;
    const rOut = halfB;
    const rIn = Math.max(0.5, rOut - e);
    const centerZ = rOut;
    const outerRing: Array<{ v: number; z: number }> = [];
    const innerRing: Array<{ v: number; z: number }> = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      outerRing.push({ v: cos * rOut, z: centerZ + sin * rOut });
      innerRing.push({ v: cos * rIn, z: centerZ + sin * rIn });
    }
    return { outerRing, innerRing };
  }

  if (profile.kind === "cantoneira") {
    // Perfil em "L" de abas B × H e espessura e
    const outerRing: Array<{ v: number; z: number }> = [
      { v: -halfB, z: 0 },
      { v: +halfB, z: 0 },
      { v: +halfB, z: e },
      { v: -halfB + e, z: e },
      { v: -halfB + e, z: H },
      { v: -halfB, z: H },
    ];
    return { outerRing, innerRing: null };
  }

  if (profile.kind === "perfil_u") {
    // Perfil em "U" com alma na base e duas abas verticais
    const outerRing: Array<{ v: number; z: number }> = [
      { v: -halfB, z: 0 },
      { v: +halfB, z: 0 },
      { v: +halfB, z: H },
      { v: +halfB - e, z: H },
      { v: +halfB - e, z: e },
      { v: -halfB + e, z: e },
      { v: -halfB + e, z: H },
      { v: -halfB, z: H },
    ];
    return { outerRing, innerRing: null };
  }

  if (profile.kind === "barra_chata") {
    const flatH = Math.max(1.5, e);
    const outerRing: Array<{ v: number; z: number }> = [
      { v: -halfB, z: 0 },
      { v: +halfB, z: 0 },
      { v: +halfB, z: flatH },
      { v: -halfB, z: flatH },
    ];
    return { outerRing, innerRing: null };
  }

  // Metalão Quadrado (B × B × e) ou Metalão Retangular (B × H × e)
  // Quinas externas com chanfro metalúrgico sutil (NBR 6591) e cavidade interna oca (B - 2e) × (H - 2e)
  const bevelOut = Math.min(e * 0.55, Math.min(B, H) * 0.06, 2.2);
  const bevelIn = Math.min(bevelOut * 0.5, 1.0);
  const inHalfB = Math.max(0.5, halfB - e);
  const inMinZ = e;
  const inMaxZ = Math.max(inMinZ + 1, H - e);

  const outerRing: Array<{ v: number; z: number }> = [
    { v: -halfB + bevelOut, z: 0 },
    { v: +halfB - bevelOut, z: 0 },
    { v: +halfB, z: bevelOut },
    { v: +halfB, z: H - bevelOut },
    { v: +halfB - bevelOut, z: H },
    { v: -halfB + bevelOut, z: H },
    { v: -halfB, z: H - bevelOut },
    { v: -halfB, z: bevelOut },
  ];

  const innerRing: Array<{ v: number; z: number }> = [
    { v: -inHalfB + bevelIn, z: inMinZ },
    { v: +inHalfB - bevelIn, z: inMinZ },
    { v: +inHalfB, z: inMinZ + bevelIn },
    { v: +inHalfB, z: inMaxZ - bevelIn },
    { v: +inHalfB - bevelIn, z: inMaxZ },
    { v: -inHalfB + bevelIn, z: inMaxZ },
    { v: -inHalfB, z: inMaxZ - bevelIn },
    { v: -inHalfB, z: inMinZ + bevelIn },
  ];

  return { outerRing, innerRing };
}

/**
 * Constrói a malha B-Rep triangulada (CadTessellatedShape) de todos os Perfis Estruturais / Metalões Ocos
 * presentes na lista de entidades, orientados ao longo do eixo longitudinal L (horizontal, vertical ou inclinado),
 * com altura real Z = B (ou H), 4 paredes externas, paredes internas da cavidade e bocas ocas abertas nas duas pontas.
 */
export function buildStructuralProfilesTessellatedShape(
  entities: Entity[],
): CadTessellatedShape | null {
  const profileEntries: Array<{
    entity: Entity;
    profile: EntityStructuralProfile;
    geom: StructuralBarGeometryAnalysis;
  }> = [];

  for (const ent of entities) {
    if (ent.isConstruction) continue;
    const profile = getEntityStructuralProfile(ent);
    if (!profile) continue;
    const geom = analyzeEntityBarGeometry(ent);
    if (!geom) continue;
    profileEntries.push({ entity: ent, profile, geom });
  }

  if (profileEntries.length === 0) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faceGroups: CadFaceGroup[] = [];
  const polyEdges: CadPolylineEdge[] = [];
  let totalEdgePoints = 0;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const updateBounds = (p: CadVector3D) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  };

  const addEdgeSegment = (edgeId: string, a: CadVector3D, b: CadVector3D) => {
    const idx = polyEdges.length;
    polyEdges.push({
      edgeId,
      edgeIndex: idx,
      edgeHash: idx + 1,
      points: new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]),
      pointCount: 2,
      isSeam: false,
    });
    totalEdgePoints += 2;
  };

  const addTriangle = (
    a: CadVector3D,
    b: CadVector3D,
    c: CadVector3D,
    normal?: CadVector3D,
  ) => {
    let nx = normal?.x ?? 0;
    let ny = normal?.y ?? 0;
    let nz = normal?.z ?? 0;
    if (!normal) {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
    }

    const baseIdx = positions.length / 3;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    updateBounds(a);
    updateBounds(b);
    updateBounds(c);
  };

  const addQuad = (
    faceId: string,
    a: CadVector3D,
    b: CadVector3D,
    c: CadVector3D,
    d: CadVector3D,
    normal?: CadVector3D,
  ) => {
    const startTri = indices.length / 3;
    addTriangle(a, b, c, normal);
    addTriangle(a, c, d, normal);
    const fIdx = faceGroups.length;
    faceGroups.push({
      faceId,
      faceIndex: fIdx,
      faceHash: fIdx + 1,
      startTriangle: startTri,
      triangleCount: 2,
    });
  };

  for (const { entity, profile, geom } of profileEntries) {
    const L = Math.max(2, geom.lengthL);
    const halfL = L / 2;
    const { center, axisU, axisV } = geom;
    const { outerRing, innerRing } = buildHollowCrossSectionRings(profile, geom.drawnWidthB);
    const n = outerRing.length;

    const toWorld = (s: number, v: number, z: number): CadVector3D => ({
      x: center.x + axisU.x * s + axisV.x * v,
      y: center.y + axisU.y * s + axisV.y * v,
      z,
    });

    // 1. Paredes longitudinais externas (ao longo de s ∈ [-halfL, +halfL])
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const p0Start = toWorld(-halfL, outerRing[i].v, outerRing[i].z);
      const p1Start = toWorld(-halfL, outerRing[next].v, outerRing[next].z);
      const p1End = toWorld(+halfL, outerRing[next].v, outerRing[next].z);
      const p0End = toWorld(+halfL, outerRing[i].v, outerRing[i].z);

      addQuad(`sp_face_out_${entity.id}_${i}`, p0Start, p1Start, p1End, p0End);

      // Arestas de contorno nas duas bocas e longitudinais
      addEdgeSegment(`sp_out_start_${entity.id}_${i}`, p0Start, p1Start);
      addEdgeSegment(`sp_out_end_${entity.id}_${i}`, p0End, p1End);
      addEdgeSegment(`sp_out_long_${entity.id}_${i}`, p0Start, p0End);
    }

    // 2. Se o perfil for oco (Metalão Quadrado, Metalão Retangular, Tubo Redondo):
    //    - Paredes longitudinais INTERNAS (voltadas para o interior da cavidade)
    //    - Anéis de espessura de parede `e` nas duas extremidades abertas (bocas do tubo em s = -halfL e s = +halfL)
    if (innerRing && innerRing.length === n) {
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const in0Start = toWorld(-halfL, innerRing[i].v, innerRing[i].z);
        const in1Start = toWorld(-halfL, innerRing[next].v, innerRing[next].z);
        const in1End = toWorld(+halfL, innerRing[next].v, innerRing[next].z);
        const in0End = toWorld(+halfL, innerRing[i].v, innerRing[i].z);

        // Parede interna com normal apontando para o centro oco do tubo
        addQuad(`sp_face_in_${entity.id}_${i}`, in1Start, in0Start, in0End, in1End);

        // Arestas da cavidade oca nas duas extremidades (mostram nitidamente a parede `e`)
        addEdgeSegment(`sp_in_start_${entity.id}_${i}`, in0Start, in1Start);
        addEdgeSegment(`sp_in_end_${entity.id}_${i}`, in0End, in1End);

        // Arestas longitudinais internas principais
        if (i % 2 === 1) {
          addEdgeSegment(`sp_in_long_${entity.id}_${i}`, in0Start, in0End);
        }

        // Anel da boca inicial (s = -halfL, normal = -axisU)
        const out0Start = toWorld(-halfL, outerRing[i].v, outerRing[i].z);
        const out1Start = toWorld(-halfL, outerRing[next].v, outerRing[next].z);
        addQuad(
          `sp_face_cap_start_${entity.id}_${i}`,
          out1Start,
          out0Start,
          in0Start,
          in1Start,
          { x: -axisU.x, y: -axisU.y, z: 0 },
        );

        // Anel da boca final (s = +halfL, normal = +axisU)
        const out0End = toWorld(+halfL, outerRing[i].v, outerRing[i].z);
        const out1End = toWorld(+halfL, outerRing[next].v, outerRing[next].z);
        addQuad(
          `sp_face_cap_end_${entity.id}_${i}`,
          out0End,
          out1End,
          in1End,
          in0End,
          { x: axisU.x, y: axisU.y, z: 0 },
        );
      }
    } else {
      // Perfis abertos/maciços (Cantoneira, Perfil U, Barra Chata): fecha as tampas das extremidades
      if (n === 4) {
        const s0 = toWorld(-halfL, outerRing[0].v, outerRing[0].z);
        const s1 = toWorld(-halfL, outerRing[1].v, outerRing[1].z);
        const s2 = toWorld(-halfL, outerRing[2].v, outerRing[2].z);
        const s3 = toWorld(-halfL, outerRing[3].v, outerRing[3].z);
        addQuad(`sp_cap_s_${entity.id}`, s3, s2, s1, s0, {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });

        const e0 = toWorld(+halfL, outerRing[0].v, outerRing[0].z);
        const e1 = toWorld(+halfL, outerRing[1].v, outerRing[1].z);
        const e2 = toWorld(+halfL, outerRing[2].v, outerRing[2].z);
        const e3 = toWorld(+halfL, outerRing[3].v, outerRing[3].z);
        addQuad(`sp_cap_e_${entity.id}`, e0, e1, e2, e3, {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
      } else if (n === 6) {
        const s = outerRing.map((pt) => toWorld(-halfL, pt.v, pt.z));
        addQuad(`sp_cap_s1_${entity.id}`, s[3], s[2], s[1], s[0], {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_s2_${entity.id}`, s[5], s[4], s[3], s[0], {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });

        const e = outerRing.map((pt) => toWorld(+halfL, pt.v, pt.z));
        addQuad(`sp_cap_e1_${entity.id}`, e[0], e[1], e[2], e[3], {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_e2_${entity.id}`, e[0], e[3], e[4], e[5], {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
      } else if (n === 8) {
        const s = outerRing.map((pt) => toWorld(-halfL, pt.v, pt.z));
        addQuad(`sp_cap_s1_${entity.id}`, s[5], s[4], s[1], s[0], {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_s2_${entity.id}`, s[4], s[3], s[2], s[1], {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_s3_${entity.id}`, s[0], s[7], s[6], s[5], {
          x: -axisU.x,
          y: -axisU.y,
          z: 0,
        });

        const e = outerRing.map((pt) => toWorld(+halfL, pt.v, pt.z));
        addQuad(`sp_cap_e1_${entity.id}`, e[0], e[1], e[4], e[5], {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_e2_${entity.id}`, e[1], e[2], e[3], e[4], {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
        addQuad(`sp_cap_e3_${entity.id}`, e[5], e[6], e[7], e[0], {
          x: axisU.x,
          y: axisU.y,
          z: 0,
        });
      }
    }
  }

  const bMin = {
    x: Number.isFinite(minX) ? minX : -50,
    y: Number.isFinite(minY) ? minY : -50,
    z: Number.isFinite(minZ) ? minZ : 0,
  };
  const bMax = {
    x: Number.isFinite(maxX) ? maxX : 50,
    y: Number.isFinite(maxY) ? maxY : 50,
    z: Number.isFinite(maxZ) ? maxZ : 50,
  };

  return {
    mesh: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      faceGroups,
    },
    edges: {
      edges: polyEdges,
      totalEdges: polyEdges.length,
      totalPoints: totalEdgePoints,
    },
    bounds: {
      min: bMin,
      max: bMax,
      size: {
        x: Math.max(0.1, bMax.x - bMin.x),
        y: Math.max(0.1, bMax.y - bMin.y),
        z: Math.max(0.1, bMax.z - bMin.z),
      },
    },
  };
}

/**
 * Combina duas malhas B-Rep (`CadTessellatedShape`) em uma única malha unificada
 * (ex: chapas planas com furos + barras de Metalão Quadrado oco).
 */
export function mergeCadTessellatedShapes(
  a: CadTessellatedShape | null,
  b: CadTessellatedShape | null,
): CadTessellatedShape | null {
  if (!a) return b;
  if (!b) return a;

  const vertOffset = a.mesh.positions.length / 3;
  const triOffset = a.mesh.indices.length / 3;
  const faceOffset = a.mesh.faceGroups.length;

  const positions = new Float32Array(a.mesh.positions.length + b.mesh.positions.length);
  positions.set(a.mesh.positions, 0);
  positions.set(b.mesh.positions, a.mesh.positions.length);

  const normals = new Float32Array(a.mesh.normals.length + b.mesh.normals.length);
  normals.set(a.mesh.normals, 0);
  normals.set(b.mesh.normals, a.mesh.normals.length);

  const indices = new Uint32Array(a.mesh.indices.length + b.mesh.indices.length);
  indices.set(a.mesh.indices, 0);
  for (let i = 0; i < b.mesh.indices.length; i++) {
    indices[a.mesh.indices.length + i] = b.mesh.indices[i] + vertOffset;
  }

  const faceGroups: CadFaceGroup[] = [
    ...a.mesh.faceGroups,
    ...b.mesh.faceGroups.map((fg, i) => ({
      ...fg,
      faceIndex: faceOffset + i,
      startTriangle: fg.startTriangle + triOffset,
    })),
  ];

  const edgeOffset = a.edges.edges.length;
  const mergedEdges: CadPolylineEdge[] = [
    ...a.edges.edges,
    ...b.edges.edges.map((ed, i) => ({
      ...ed,
      edgeIndex: edgeOffset + i,
    })),
  ];

  const min = {
    x: Math.min(a.bounds.min.x, b.bounds.min.x),
    y: Math.min(a.bounds.min.y, b.bounds.min.y),
    z: Math.min(a.bounds.min.z, b.bounds.min.z),
  };
  const max = {
    x: Math.max(a.bounds.max.x, b.bounds.max.x),
    y: Math.max(a.bounds.max.y, b.bounds.max.y),
    z: Math.max(a.bounds.max.z, b.bounds.max.z),
  };

  return {
    mesh: {
      positions,
      normals,
      indices,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      faceGroups,
    },
    edges: {
      edges: mergedEdges,
      totalEdges: mergedEdges.length,
      totalPoints: a.edges.totalPoints + b.edges.totalPoints,
    },
    bounds: {
      min,
      max,
      size: {
        x: Math.max(0.1, max.x - min.x),
        y: Math.max(0.1, max.y - min.y),
        z: Math.max(0.1, max.z - min.z),
      },
    },
  };
}
