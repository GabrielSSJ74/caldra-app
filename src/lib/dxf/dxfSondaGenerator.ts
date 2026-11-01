/**
 * Gerador do arquivo físico de diagnóstico DXF-SONDA (dxf-sonda-cypcut.dxf)
 * conforme Seção 2.2 e Seção 12 da especificação CHAMFER VISION 2.0.
 *
 * Contém 5 formas de teste lado a lado na layer CUT (com FS_CYPCUT Channel 1):
 *  1. Sonda 1 (x = 40, y = 50): Entidade CIRCLE pura (R = 25 mm)
 *  2. Sonda 2 (x = 120, y = 50): LWPOLYLINE fechada de 2 vértices com bulge = 1.0 (círculo por 2 semicírculos)
 *  3. Sonda 3 (x = 200, y = 50): LWPOLYLINE fechada de 24 lados retos sem bulge (controle negativo facetado)
 *  4. Sonda 4 (x = 310, y = 50): Retângulo 100×60 mm com 4 cantos R = 10 mm via LWPOLYLINE fechada + bulge = tan(π/8)
 *  5. Sonda 5 (x = 440, y = 50): Rasgo oblongo 80×20 mm via LWPOLYLINE fechada de 4 vértices + bulge = 1.0 nos 2 semicírculos
 */

import { exportDxf, type DxfDocument, type DxfEntity } from "./dxfService";
import { cypcutXdata } from "./cncExport";
import { CYPCUT_APPID, EXPORT_ACI } from "@/lib/lab2d/roles";

export function buildDxfSondaDocument(): DxfDocument {
  const xdata = [cypcutXdata("CUT")];
  const k90 = Math.tan(Math.PI / 8); // 0.41421356 para arco de 90°

  // 1. CIRCLE puro (R = 25 mm) centrado em (40, 50)
  const sonda1Circle: DxfEntity = {
    type: "CIRCLE",
    layer: "CUT",
    center: { x: 40, y: 50 },
    radius: 25,
    xdata,
  };

  // 2. LWPOLYLINE fechada de 2 semicírculos com bulge = 1.0 (R = 25 mm) centrada em (120, 50)
  const sonda2BulgeCircle: DxfEntity = {
    type: "LWPOLYLINE",
    layer: "CUT",
    closed: true,
    points: [
      { x: 95, y: 50, bulge: 1.0 },
      { x: 145, y: 50, bulge: 1.0 },
    ],
    xdata,
  };

  // 3. LWPOLYLINE fechada de 24 lados retos sem bulge (controle negativo facetado, R = 25 mm) centrada em (200, 50)
  const sonda3Faceted24Gon: DxfEntity = {
    type: "LWPOLYLINE",
    layer: "CUT",
    closed: true,
    points: Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return {
        x: 200 + 25 * Math.cos(a),
        y: 50 + 25 * Math.sin(a),
      };
    }),
    xdata,
  };

  // 4. Retângulo arredondado 100×60 mm com R = 10 mm centrado em (310, 50) -> x in [260, 360], y in [20, 80]
  const sonda4RoundedRect: DxfEntity = {
    type: "LWPOLYLINE",
    layer: "CUT",
    closed: true,
    points: [
      { x: 270, y: 20 },
      { x: 350, y: 20, bulge: k90 },
      { x: 360, y: 30 },
      { x: 360, y: 70, bulge: k90 },
      { x: 350, y: 80 },
      { x: 270, y: 80, bulge: k90 },
      { x: 260, y: 70 },
      { x: 260, y: 30, bulge: k90 },
    ],
    xdata,
  };

  // 5. Rasgo oblongo 80×20 mm (comprimento total 80 mm, largura 20 mm -> R = 10 mm, distância entre centros = 60 mm)
  // Centrado em (440, 50) -> centros dos semicírculos em (410, 50) e (470, 50)
  const sonda5OblongSlot: DxfEntity = {
    type: "LWPOLYLINE",
    layer: "CUT",
    closed: true,
    points: [
      { x: 410, y: 40 },
      { x: 470, y: 40, bulge: 1.0 },
      { x: 470, y: 60 },
      { x: 410, y: 60, bulge: 1.0 },
    ],
    xdata,
  };

  return {
    layers: [{ name: "CUT", color: EXPORT_ACI.CUT ?? 3 }],
    appIds: [CYPCUT_APPID],
    entities: [
      sonda1Circle,
      sonda2BulgeCircle,
      sonda3Faceted24Gon,
      sonda4RoundedRect,
      sonda5OblongSlot,
    ],
  };
}

export function generateDxfSondaText(): string {
  return exportDxf(buildDxfSondaDocument());
}
