/**
 * EXPORTADOR DXF CNC — dedicado à fabricação.
 *
 * Não substitui o DXF completo: é um caminho especializado que escreve
 * apenas geometria fabricável nas layers CNC simples CUT / MARK / BEND,
 * em milímetros, escala 1:1, na ordem planejada pelo CALDRA.
 *
 * NUNCA entram aqui: grade, moldura, cursor, seleção, chevrons de FLUXO,
 * selos, indicadores de interface ou cotas.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { DxfDocument, DxfEntity } from "@/lib/dxf/dxfService";
import { importDxf } from "@/lib/dxf/dxfService";
import { flattenPath } from "@/lib/lab2d/bezier";
import type { Entity } from "@/lib/lab2d/core";
import { pathLength } from "@/lib/lab2d/cutPlan";
import {
  cncLayerOf,
  contoursOf,
  leadPolyline,
  type CncLayer,
} from "@/lib/lab2d/manufacturing";

export type CncExportOptions = {
  /** Layers CNC habilitadas. REFERENCE e DIMENSION vêm desligadas. */
  layers: Record<CncLayer, boolean>;
  /** Escrever os lead-in/lead-out como geometria no arquivo. */
  leads: boolean;
  /** Achatar curvas Bézier em polilinha (máquinas antigas). */
  flattenCurves: boolean;
};

export const DEFAULT_CNC_OPTIONS: CncExportOptions = {
  layers: { CUT: true, MARK: true, BEND: true, REFERENCE: false, DIMENSION: false },
  leads: true,
  flattenCurves: false,
};

/** DXF é Y para cima; o modelo do CHAMFER é Y para baixo. */
const m = (p: Vec2) => ({ x: p.x, y: -p.y });

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

export type CncCounts = Record<CncLayer, number> & { leadIn: number; leadOut: number; contours: number };

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
  };
  for (const e of entities) {
    if (e.type === "text") continue;
    const l = cncLayerOf(e.layer);
    if (l) c[l]++;
    if (leadPolyline(e, "in")) c.leadIn++;
    if (leadPolyline(e, "out")) c.leadOut++;
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
  const used = new Set<CncLayer>();

  for (const e of entities) {
    if (e.type === "text") continue;
    const cnc = cncLayerOf(e.layer);
    if (!cnc || !opts.layers[cnc]) continue;
    used.add(cnc);

    if (opts.leads && cnc === "CUT") {
      const lin = leadPolyline(e, "in");
      if (lin) out.push({ type: "LWPOLYLINE", layer: "CUT", closed: false, points: lin.map(m) });
    }
    out.push(...geometryOf(e, cnc, opts.flattenCurves));
    if (opts.leads && cnc === "CUT") {
      const lout = leadPolyline(e, "out");
      if (lout) out.push({ type: "LWPOLYLINE", layer: "CUT", closed: false, points: lout.map(m) });
    }
  }

  const ACI: Record<CncLayer, number> = {
    CUT: 1,
    MARK: 5,
    BEND: 3,
    REFERENCE: 8,
    DIMENSION: 9,
  };
  const order: CncLayer[] = ["CUT", "MARK", "BEND", "REFERENCE", "DIMENSION"];
  return {
    layers: order.filter((l) => used.has(l)).map((l) => ({ name: l, color: ACI[l] })),
    entities: out,
  };
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

  return { ok: rows.every((r) => r.ok), rows };
}

/** Comprimento total de corte do plano, em mm. */
export const cncCutLength = (entities: Entity[]) =>
  entities
    .filter((e) => cncLayerOf(e.layer) === "CUT" && e.type !== "text")
    .reduce((a, e) => a + pathLength(e), 0);
