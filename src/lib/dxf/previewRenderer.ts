/**
 * PRÉ-VISUALIZAÇÃO DO ARQUIVO DXF.
 *
 * A prévia é desenhada A PARTIR DO PRÓPRIO DOCUMENTO DXF gerado — nunca da
 * tela do editor. O que aparece aqui é exatamente o que será gravado: mesma
 * geometria, mesmas layers, mesmo enquadramento.
 *
 * As cores são fixas por layer de saída (corte verde, recorte âmbar, marcação
 * azul, dobra rosa) e não dependem do tema da interface — o fundo é sempre
 * claro, então nenhuma linha pode ficar branca sobre branco.
 */

import type { DxfDocument, DxfEntity, DxfPoint } from "@/lib/dxf/dxfService";
import {
  BEND_COLOR,
  CUT_COLOR,
  MARK_COLOR,
  RECORTE_COLOR,
  REFERENCE_COLOR,
} from "@/lib/lab2d/technical";

/** Cor de traço por nome de layer do arquivo. */
export const PREVIEW_LAYER_COLOR: Record<string, string> = {
  CUT: CUT_COLOR,
  RECORTE: RECORTE_COLOR,
  MARK: MARK_COLOR,
  BEND: BEND_COLOR,
  LEAD_IN: MARK_COLOR,
  LEAD_OUT: MARK_COLOR,
  REFERENCE: REFERENCE_COLOR,
  DIMENSION: REFERENCE_COLOR,
};

const PREVIEW_FALLBACK = "#111827";

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function grow(box: Box, p: DxfPoint) {
  box.minX = Math.min(box.minX, p.x);
  box.minY = Math.min(box.minY, p.y);
  box.maxX = Math.max(box.maxX, p.x);
  box.maxY = Math.max(box.maxY, p.y);
}

function boundsOf(entities: DxfEntity[]): Box | null {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let any = false;
  for (const e of entities) {
    any = true;
    switch (e.type) {
      case "LINE":
        grow(box, e.start);
        grow(box, e.end);
        break;
      case "LWPOLYLINE": {
        e.points.forEach((p) => grow(box, p));
        const n = e.points.length;
        const segs = e.closed ? n : Math.max(0, n - 1);
        for (let i = 0; i < segs; i++) {
          const p0 = e.points[i]!;
          const p1 = e.points[(i + 1) % n]!;
          const b = p0.bulge ?? 0;
          if (Math.abs(b) > 1e-6) {
            const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const sag = Math.abs(b) * (chord / 2);
            const mx = (p0.x + p1.x) / 2;
            const my = (p0.y + p1.y) / 2;
            grow(box, { x: mx - sag, y: my - sag });
            grow(box, { x: mx + sag, y: my + sag });
          }
        }
        break;
      }
      case "SPLINE":
        e.controls.forEach((p) => grow(box, p));
        break;
      case "CIRCLE":
      case "ARC":
        grow(box, { x: e.center.x - e.radius, y: e.center.y - e.radius });
        grow(box, { x: e.center.x + e.radius, y: e.center.y + e.radius });
        break;
      case "ELLIPSE": {
        const rx = Math.hypot(e.majorEnd.x, e.majorEnd.y);
        grow(box, { x: e.center.x - rx, y: e.center.y - rx });
        grow(box, { x: e.center.x + rx, y: e.center.y + rx });
        break;
      }
    }
  }
  return any && Number.isFinite(box.minX) ? box : null;
}

const polar = (c: DxfPoint, r: number, deg: number) => ({
  x: c.x + r * Math.cos((deg * Math.PI) / 180),
  y: c.y + r * Math.sin((deg * Math.PI) / 180),
});

function pathOf(e: DxfEntity): string | null {
  switch (e.type) {
    case "LINE":
      return `M ${f(e.start.x)} ${f(e.start.y)} L ${f(e.end.x)} ${f(e.end.y)}`;
    case "LWPOLYLINE": {
      if (!e.points.length) return null;
      const n = e.points.length;
      const segs = e.closed ? n : Math.max(0, n - 1);
      let d = `M ${f(e.points[0]!.x)} ${f(e.points[0]!.y)}`;
      for (let i = 0; i < segs; i++) {
        const p0 = e.points[i]!;
        const p1 = e.points[(i + 1) % n]!;
        const b = p0.bulge ?? 0;
        if (Math.abs(b) > 1e-6) {
          const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const theta = 4 * Math.atan(Math.abs(b));
          const r = chord / (2 * Math.sin(theta / 2));
          const largeArc = Math.abs(b) > 1 ? 1 : 0;
          const sweepFlag = b > 0 ? 1 : 0;
          d += ` A ${f(r)} ${f(r)} 0 ${largeArc} ${sweepFlag} ${f(p1.x)} ${f(p1.y)}`;
        } else {
          d += ` L ${f(p1.x)} ${f(p1.y)}`;
        }
      }
      if (e.closed && Math.abs(e.points[n - 1]?.bulge ?? 0) <= 1e-6) {
        d += " Z";
      }
      return d;
    }
    case "SPLINE": {
      if (e.controls.length < 4) return null;
      let d = `M ${f(e.controls[0]!.x)} ${f(e.controls[0]!.y)}`;
      for (let i = 1; i + 2 < e.controls.length; i += 3) {
        const [c1, c2, p] = [e.controls[i]!, e.controls[i + 1]!, e.controls[i + 2]!];
        d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p.x)} ${f(p.y)}`;
      }
      return d + (e.closed ? " Z" : "");
    }
    case "CIRCLE":
      return (
        `M ${f(e.center.x - e.radius)} ${f(e.center.y)}` +
        ` a ${f(e.radius)} ${f(e.radius)} 0 1 0 ${f(e.radius * 2)} 0` +
        ` a ${f(e.radius)} ${f(e.radius)} 0 1 0 ${f(-e.radius * 2)} 0`
      );
    case "ELLIPSE": {
      const rx = Math.hypot(e.majorEnd.x, e.majorEnd.y);
      const ry = rx * e.axisRatio;
      const deg = (Math.atan2(e.majorEnd.y, e.majorEnd.x) * 180) / Math.PI;
      return (
        `M ${f(e.center.x - e.majorEnd.x)} ${f(e.center.y - e.majorEnd.y)}` +
        ` A ${f(rx)} ${f(ry)} ${f(deg)} 1 0 ${f(e.center.x + e.majorEnd.x)} ${f(e.center.y + e.majorEnd.y)}` +
        ` A ${f(rx)} ${f(ry)} ${f(deg)} 1 0 ${f(e.center.x - e.majorEnd.x)} ${f(e.center.y - e.majorEnd.y)}`
      );
    }
    case "ARC": {
      const a = polar(e.center, e.radius, e.startAngle);
      const b = polar(e.center, e.radius, e.endAngle);
      const sweep = (e.endAngle - e.startAngle + 360) % 360;
      return `M ${f(a.x)} ${f(a.y)} A ${f(e.radius)} ${f(e.radius)} 0 ${sweep > 180 ? 1 : 0} 1 ${f(b.x)} ${f(b.y)}`;
    }
  }
}

export type DxfPreview = { svg: string; widthMm: number; heightMm: number; count: number };

/** SVG da prévia, em coordenadas reais do arquivo (1 unidade = 1 mm). */
export function previewDxfSvg(doc: DxfDocument): DxfPreview {
  const box = boundsOf(doc.entities) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const pad = Math.max(w, h) * 0.06 + 4;
  const s = Math.max(w, h) / 200;

  const body = doc.entities
    .map((e) => {
      const d = pathOf(e);
      if (!d) return "";
      const stroke = PREVIEW_LAYER_COLOR[e.layer] ?? PREVIEW_FALLBACK;
      const weight = e.layer === "CUT" ? 1.5 : 1.1;
      const dash = e.layer === "BEND" ? ` stroke-dasharray="${f(6 * s)} ${f(2.5 * s)}"` : "";
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(
        weight * s,
      )}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(box.minX - pad)} ${f(box.minY - pad)} ${f(
      w + pad * 2,
    )} ${f(h + pad * 2)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${f(box.minX - pad)}" y="${f(box.minY - pad)}" width="${f(w + pad * 2)}" height="${f(
      h + pad * 2,
    )}" fill="#ffffff"/>` +
    body +
    `</svg>`;

  return { svg, widthMm: w, heightMm: h, count: doc.entities.length };
}
