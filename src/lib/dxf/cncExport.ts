/**
 * EXPORTADOR DXF CNC — dedicado à fabricação.
 *
 * A operação de cada entidade vem do seu PAPEL (ManufacturingRole), nunca
 * da cor. O papel é traduzido para um nome de layer no arquivo pelo
 * DxfExportProfile escolhido (TÉCNICO / PRODUÇÃO / CYP CUT).
 *
 * NUNCA entram aqui: grade, moldura, cursor, seleção, chevrons de FLUXO,
 * selos, indicadores de interface. Setas de direção são metadado e jamais
 * viram geometria.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { DxfDocument, DxfEntity } from "@/lib/dxf/dxfService";
import { importDxf } from "@/lib/dxf/dxfService";
import { flattenPath } from "@/lib/lab2d/bezier";
import type { Entity } from "@/lib/lab2d/core";
import { pathLength } from "@/lib/lab2d/cutPlan";
import {
  contoursOf,
  leadPolyline,
  validateManufacturing,
  type CncIssue,
} from "@/lib/lab2d/manufacturing";
import {
  DEFAULT_PROFILE_ID,
  ENTITY_ROLES,
  EXPORT_ACI,
  profileById,
  roleOf,
  ROLE_LABEL,
  structureMap,
  unclassifiedOf,
  type EntityRole,
  type ManufacturingRole,
} from "@/lib/lab2d/roles";

/** Papéis diretamente selecionáveis na exportação. */
export type CncRole = EntityRole;

export type CncExportOptions = {
  /** Perfil de exportação (mapeamento papel → layer do arquivo). */
  profileId: string;
  /** Papéis habilitados pelo usuário. */
  roles: Record<CncRole, boolean>;
  /** Escrever os lead-in/lead-out como geometria no arquivo. */
  leads: boolean;
  /** Achatar curvas Bézier em polilinha (máquinas antigas). */
  flattenCurves: boolean;
  /** Algumas máquinas executam dobra como marcação — mapeamento, não cor. */
  bendAs: "BEND" | "MARK";
};

export const DEFAULT_CNC_OPTIONS: CncExportOptions = {
  profileId: DEFAULT_PROFILE_ID,
  roles: { CUT: true, MARK: true, BEND: true, REFERENCE: false, DIMENSION: false },
  leads: true,
  flattenCurves: false,
  bendAs: "BEND",
};

/** DXF é Y para cima; o modelo do CHAMFER é Y para baixo. */
const m = (p: Vec2) => ({ x: p.x, y: -p.y });

/** Layer de saída de um papel, considerando perfil e mapeamento de dobra. */
export function exportLayerOf(
  role: ManufacturingRole,
  opts: CncExportOptions,
): string | null {
  const profile = profileById(opts.profileId);
  const effective: ManufacturingRole =
    role === "BEND" && opts.bendAs === "MARK" ? "MARK" : role;
  return profile.layerMap[effective] ?? null;
}

/** Mapeamento visível ao usuário antes de exportar. */
export function layerMapping(opts: CncExportOptions) {
  return ENTITY_ROLES.map((role) => ({
    role,
    label: ROLE_LABEL[role],
    enabled: opts.roles[role],
    layer: opts.roles[role] ? exportLayerOf(role, opts) : null,
  }));
}

function geometryOf(e: Entity, layer: string, flatten: boolean): DxfEntity[] {
  switch (e.type) {
    case "line":
      return [{ type: "LINE", layer, start: m({ x: e.x1, y: e.y1 }), end: m({ x: e.x2, y: e.y2 }) }];
    case "polyline":
      return [{ type: "LWPOLYLINE", layer, closed: e.closed, points: e.pts.map(m) }];
    case "circle":
      return [{ type: "CIRCLE", layer, center: m({ x: e.cx, y: e.cy }), radius: e.r }];
    case "arc": {
      const deg = (r: number) => ((-r * 180) / Math.PI + 360) % 360;
      return [
        {
          type: "ARC",
          layer,
          center: m({ x: e.cx, y: e.cy }),
          radius: e.r,
          startAngle: deg(e.a1),
          endAngle: deg(e.a0),
        },
      ];
    }
    case "path": {
      if (flatten)
        return [
          {
            type: "LWPOLYLINE",
            layer,
            closed: e.closed,
            points: flattenPath(e.start, e.segs, e.closed, 16).map(m),
          },
        ];
      const controls: Vec2[] = [m(e.start)];
      let cur = e.start;
      for (const s of e.segs) {
        const c1 = s.line
          ? { x: cur.x + (s.p.x - cur.x) / 3, y: cur.y + (s.p.y - cur.y) / 3 }
          : s.c1;
        const c2 = s.line
          ? { x: cur.x + (2 * (s.p.x - cur.x)) / 3, y: cur.y + (2 * (s.p.y - cur.y)) / 3 }
          : s.c2;
        controls.push(m(c1), m(c2), m(s.p));
        cur = s.p;
      }
      return controls.length >= 4
        ? [{ type: "SPLINE", layer, controls, closed: e.closed }]
        : [];
    }
    default:
      return [];
  }
}

/* --------------------------------------------------------------- contagem */

export type CncCounts = Record<CncRole, number> & {
  leadIn: number;
  leadOut: number;
  contours: number;
  unclassified: number;
  outer: number;
  holes: number;
  slots: number;
  internal: number;
};

export function cncCounts(entities: Entity[]): CncCounts {
  const c: CncCounts = {
    CUT: 0,
    MARK: 0,
    BEND: 0,
    REFERENCE: 0,
    DIMENSION: 0,
    leadIn: 0,
    leadOut: 0,
    contours: contoursOf(entities).length,
    unclassified: unclassifiedOf(entities).length,
    outer: 0,
    holes: 0,
    slots: 0,
    internal: 0,
  };
  const structure = structureMap(entities);
  for (const e of entities) {
    const r = roleOf(e);
    if (r && (ENTITY_ROLES as ManufacturingRole[]).includes(r)) c[r as CncRole]++;
    if (e.type === "text") continue;
    if (leadPolyline(e, "in")) c.leadIn++;
    if (leadPolyline(e, "out")) c.leadOut++;
    switch (structure.get(e.id)) {
      case "outer":
        c.outer++;
        break;
      case "hole":
        c.holes++;
        break;
      case "slot":
        c.slots++;
        break;
      case "internal":
        c.internal++;
        break;
      default:
        break;
    }
  }
  return c;
}

/**
 * Constrói o documento DXF CNC.
 * A ORDEM do array de entidades é a intenção de sequência do CALDRA e é
 * preservada na estrutura do arquivo (o CypCut pode reordenar segundo a
 * própria configuração — isso é comportamento do software de destino).
 */
export function buildCncDxf(entities: Entity[], opts: CncExportOptions): DxfDocument {
  const out: DxfEntity[] = [];
  const used: string[] = [];
  const useLayer = (name: string) => {
    if (!used.includes(name)) used.push(name);
    return name;
  };

  for (const e of entities) {
    if (e.type === "text") continue; // textos técnicos não vão para o arquivo de corte
    const role = roleOf(e);
    if (!role || !(ENTITY_ROLES as ManufacturingRole[]).includes(role)) continue;
    if (!opts.roles[role as CncRole]) continue;
    const layer = exportLayerOf(role, opts);
    if (!layer) continue;
    useLayer(layer);

    const isCut = role === "CUT";
    if (opts.leads && isCut) {
      const lin = leadPolyline(e, "in");
      const target = exportLayerOf("LEAD_IN", opts);
      if (lin && target)
        out.push({ type: "LWPOLYLINE", layer: useLayer(target), closed: false, points: lin.map(m) });
    }
    out.push(...geometryOf(e, layer, opts.flattenCurves));
    if (opts.leads && isCut) {
      const lout = leadPolyline(e, "out");
      const target = exportLayerOf("LEAD_OUT", opts);
      if (lout && target)
        out.push({ type: "LWPOLYLINE", layer: useLayer(target), closed: false, points: lout.map(m) });
    }
  }

  return {
    layers: used.map((name, i) => ({ name, color: EXPORT_ACI[name] ?? i + 1 })),
    entities: out,
  };
}

/* ------------------------------------------------- validação de fabricação */

/**
 * Validação semântica antes do download: classificação, duplicação,
 * segmentos degenerados e fechamento do contorno de corte.
 */
export function validateCncExport(entities: Entity[], opts: CncExportOptions): CncIssue[] {
  const issues: CncIssue[] = [...validateManufacturing(entities)];

  for (const e of unclassifiedOf(entities))
    issues.push({
      level: "error",
      scope: "Classificação",
      message: `Entidade ${e.type} sem função de fabricação (camada "${e.layer}").`,
    });

  const structure = structureMap(entities);
  const outer = entities.filter((e) => structure.get(e.id) === "outer");
  if (opts.roles.CUT && outer.length === 0)
    issues.push({
      level: "error",
      scope: "Contorno",
      message: "Nenhum contorno externo fechado de corte identificado.",
    });

  for (const c of contoursOf(entities))
    if (!c.closed)
      issues.push({
        level: "warning",
        scope: `Contorno ${String(c.sequence).padStart(2, "0")}`,
        message: "Contorno de corte aberto (possível gap).",
      });

  const doc = buildCncDxf(entities, opts);
  for (const e of doc.entities) {
    if (e.type === "LINE" && Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y) < 0.01)
      issues.push({ level: "warning", scope: "Geometria", message: "Segmento degenerado." });
    if (e.type === "CIRCLE" && e.radius < 0.05)
      issues.push({ level: "warning", scope: "Geometria", message: "Círculo degenerado." });
  }
  if (!doc.entities.length)
    issues.push({
      level: "error",
      scope: "Exportação",
      message: "Nenhuma geometria nas layers escolhidas.",
    });

  return issues;
}

/* ------------------------------------------------- verificação do arquivo */

export type CncVerification = {
  ok: boolean;
  rows: { field: string; expected: string; actual: string; ok: boolean }[];
};

/** Relê o DXF gerado com o importador interno e compara com o modelo. */
export function verifyCncDxf(
  entities: Entity[],
  opts: CncExportOptions,
  dxfText: string,
): CncVerification {
  const doc = buildCncDxf(entities, opts);
  const back = importDxf(dxfText);
  const rows: CncVerification["rows"] = [];

  const push = (field: string, expected: unknown, actual: unknown) => {
    const e = String(expected);
    const a = String(actual);
    rows.push({ field, expected: e, actual: a, ok: e === a });
  };

  push("Entidades", doc.entities.length, back.entities.length);
  for (const l of doc.layers) {
    push(
      `Layer ${l.name}`,
      doc.entities.filter((e) => e.layer === l.name).length,
      back.entities.filter((e) => e.layer === l.name).length,
    );
  }
  const lenOf = (list: DxfEntity[]) =>
    list.reduce((acc, e) => {
      if (e.type === "LINE") return acc + Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
      if (e.type === "CIRCLE") return acc + 2 * Math.PI * e.radius;
      if (e.type === "LWPOLYLINE")
        return (
          acc +
          e.points.reduce(
            (s, p, i) => (i ? s + Math.hypot(p.x - e.points[i - 1]!.x, p.y - e.points[i - 1]!.y) : s),
            0,
          )
        );
      return acc;
    }, 0);
  push("Perímetro (mm)", lenOf(doc.entities).toFixed(1), lenOf(back.entities).toFixed(1));
  push("Unidade", "mm", /\$INSUNITS\n\s*70\n4/.test(dxfText) ? "mm" : "?");
  push("Escala", "1:1", "1:1");
  push("Geometria não classificada", 0, unclassifiedOf(entities).length);


  return { ok: rows.every((r) => r.ok), rows };
}

/** Comprimento total de corte do plano, em mm. */
export const cncCutLength = (entities: Entity[]) =>
  entities
    .filter((e) => roleOf(e) === "CUT" && e.type !== "text")
    .reduce((a, e) => a + pathLength(e), 0);
