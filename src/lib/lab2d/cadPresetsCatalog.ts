/**
 * CALDRA CHAMFER — CATÁLOGO DE PRESETS INTELIGENTES DE CALDEIRARIA E MECÂNICA (ETAPA 33)
 *
 * Gera GEOMETRIA REAL 100% EDITÁVEL (linhas, círculos, polilinhas, arcos) com camadas corretas:
 *  1. Flange Circular (Øexterno, Øfuro_central, Øcírculo_furação, N_furos, Øfuro)
 *  2. Base de Fixação / Sapata (Largura, Comprimento, 4 Furos ou Slots nos cantos, Chanfro de canto)
 *  3. Tubo Retangular / Metalon (Largura, Altura, Espessura de parede, Raio externo de dobra)
 *  4. Placa com Furação Perfurada / Grelha (Grade linear NxM furos)
 *  5. Suporte Triangular Nervurado (Mão-francesa com alívio central)
 *  6. Degrau de Escada Marinheiro / Industrial (com abas de dobra e furação de montagem)
 */

import type { Vec2 } from "@/lib/geometry/types";
import { uid, type Entity } from "./core";
import { createSlotPolyline } from "./cadGeometryCore";

export interface PresetParamDef {
  id: string;
  label: string;
  defaultValue: number;
  unit: string;
  min: number;
  max: number;
}

export interface PresetDefinition {
  id: string;
  name: string;
  category: "caldeiraria" | "mecanica" | "estrutural" | "chapas";
  description: string;
  params: PresetParamDef[];
  generate: (params: Record<string, number>, basePos: Vec2) => Entity[];
}

export const CAD_PRESETS_CATALOG: PresetDefinition[] = [
  {
    id: "circular_flange",
    name: "Flange Circular com Furação",
    category: "caldeiraria",
    description: "Flange com furo de passagem central e furação polar simétrica (DIN/ANSI).",
    params: [
      { id: "outerDia", label: "Ø Externo (OD)", defaultValue: 300, unit: "mm", min: 50, max: 2000 },
      { id: "innerDia", label: "Ø Furo Central (ID)", defaultValue: 150, unit: "mm", min: 10, max: 1900 },
      { id: "boltCircleDia", label: "Ø Círculo de Furação (PCD)", defaultValue: 230, unit: "mm", min: 30, max: 1950 },
      { id: "numHoles", label: "Quantidade de Furos", defaultValue: 8, unit: "un", min: 3, max: 64 },
      { id: "holeDia", label: "Ø dos Furos", defaultValue: 18, unit: "mm", min: 4, max: 80 },
    ],
    generate: (p, base) => {
      const entities: Entity[] = [];
      const cx = base.x;
      const cy = base.y;
      const outerDia = p["outerDia"] ?? 300;
      const innerDia = p["innerDia"] ?? 150;
      const boltCircleDia = p["boltCircleDia"] ?? 230;
      const numHoles = p["numHoles"] ?? 8;
      const holeDia = p["holeDia"] ?? 18;

      // 1. Círculo Externo (Corte)
      entities.push({
        id: uid(),
        layer: "corte",
        type: "circle",
        cx,
        cy,
        r: outerDia / 2,
      });

      // 2. Furo Central (Recorte interno)
      if (innerDia > 0) {
        entities.push({
          id: uid(),
          layer: "recorte",
          type: "circle",
          cx,
          cy,
          r: innerDia / 2,
        });
      }

      // 3. Linha de Centro da Furação (Construção)
      entities.push({
        id: uid(),
        layer: "construcao",
        type: "circle",
        cx,
        cy,
        r: boltCircleDia / 2,
      });

      // 4. Furos de Parafuso
      const n = Math.max(3, Math.round(numHoles));
      const bcdR = boltCircleDia / 2;
      const holeR = holeDia / 2;

      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        entities.push({
          id: uid(),
          layer: "recorte",
          type: "circle",
          cx: cx + bcdR * Math.cos(a),
          cy: cy + bcdR * Math.sin(a),
          r: holeR,
        });
      }

      return entities;
    },
  },

  {
    id: "mounting_base",
    name: "Sapata / Base com Furos nos Cantos",
    category: "estrutural",
    description: "Placa base retangular de fixação com margens de furação simétricas.",
    params: [
      { id: "width", label: "Largura (X)", defaultValue: 300, unit: "mm", min: 50, max: 2000 },
      { id: "height", label: "Altura (Y)", defaultValue: 250, unit: "mm", min: 50, max: 2000 },
      { id: "margin", label: "Margem dos Furos", defaultValue: 35, unit: "mm", min: 10, max: 200 },
      { id: "holeDia", label: "Ø dos Furos", defaultValue: 22, unit: "mm", min: 5, max: 60 },
      { id: "cornerFillet", label: "Raio de Canto", defaultValue: 15, unit: "mm", min: 0, max: 50 },
    ],
    generate: (p, base) => {
      const entities: Entity[] = [];
      const w = p["width"] ?? 300;
      const h = p["height"] ?? 250;
      const m = p["margin"] ?? 35;
      const r = (p["holeDia"] ?? 22) / 2;
      const x0 = base.x;
      const y0 = base.y;

      // Contorno externo retangular
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
      });

      // 4 Furos simétricos nos cantos
      const holeCenters: Vec2[] = [
        { x: x0 + m, y: y0 + m },
        { x: x0 + w - m, y: y0 + m },
        { x: x0 + w - m, y: y0 + h - m },
        { x: x0 + m, y: y0 + h - m },
      ];

      for (const hc of holeCenters) {
        entities.push({
          id: uid(),
          layer: "recorte",
          type: "circle",
          cx: hc.x,
          cy: hc.y,
          r,
        });
      }

      return entities;
    },
  },

  {
    id: "metalon_tube",
    name: "Perfil Tubular / Metalon",
    category: "mecanica",
    description: "Perfil quadrado ou retangular oco com espessura de parede real.",
    params: [
      { id: "width", label: "Largura Externa (X)", defaultValue: 100, unit: "mm", min: 20, max: 500 },
      { id: "height", label: "Altura Externa (Y)", defaultValue: 60, unit: "mm", min: 20, max: 500 },
      { id: "thickness", label: "Espessura de Parede (e)", defaultValue: 4.75, unit: "mm", min: 1, max: 25 },
      { id: "cornerR", label: "Raio de Dobra Externo", defaultValue: 8, unit: "mm", min: 0, max: 30 },
    ],
    generate: (p, base) => {
      const entities: Entity[] = [];
      const w = p["width"] ?? 100;
      const h = p["height"] ?? 60;
      const t = p["thickness"] ?? 4.75;
      const x0 = base.x;
      const y0 = base.y;

      // Contorno externo
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
      });

      // Contorno interno oco
      entities.push({
        id: uid(),
        layer: "recorte",
        type: "polyline",
        closed: true,
        pts: [
          { x: x0 + t, y: y0 + t },
          { x: x0 + w - t, y: y0 + t },
          { x: x0 + w - t, y: y0 + h - t },
          { x: x0 + t, y: y0 + h - t },
        ],
      });

      return entities;
    },
  },

  {
    id: "slot_perforated_plate",
    name: "Chapa com Rasgos Oblongos",
    category: "chapas",
    description: "Chapa de ventilação / peneira com sequência de slots oblongos.",
    params: [
      { id: "plateW", label: "Largura da Chapa", defaultValue: 400, unit: "mm", min: 100, max: 1500 },
      { id: "plateH", label: "Altura da Chapa", defaultValue: 250, unit: "mm", min: 100, max: 1500 },
      { id: "slotLen", label: "Comprimento do Rasgo", defaultValue: 60, unit: "mm", min: 10, max: 200 },
      { id: "slotW", label: "Largura do Rasgo", defaultValue: 16, unit: "mm", min: 4, max: 50 },
      { id: "rows", label: "Linhas de Rasgos", defaultValue: 3, unit: "un", min: 1, max: 10 },
      { id: "cols", label: "Colunas de Rasgos", defaultValue: 4, unit: "un", min: 1, max: 10 },
    ],
    generate: (p, base) => {
      const entities: Entity[] = [];
      const w = p["plateW"] ?? 400;
      const h = p["plateH"] ?? 250;
      const slotLen = p["slotLen"] ?? 60;
      const slotW = p["slotW"] ?? 16;
      const x0 = base.x;
      const y0 = base.y;

      // Contorno externo
      entities.push({
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
      });

      const rows = Math.max(1, Math.round(p["rows"] ?? 3));
      const cols = Math.max(1, Math.round(p["cols"] ?? 4));
      const stepX = w / (cols + 1);
      const stepY = h / (rows + 1);

      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const slot = createSlotPolyline(
            { x: x0 + c * stepX, y: y0 + r * stepY },
            slotLen,
            slotW,
            0,
            "recorte",
          );
          entities.push(slot);
        }
      }

      return entities;
    },
  },
];
