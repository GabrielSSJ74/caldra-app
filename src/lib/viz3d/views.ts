import { elbowModel } from "@/lib/geometry/elbowSegments";
import type { WireParams } from "@/lib/viz3d/wire";

export type PrimRole = "outer" | "inner" | "joint" | "centerline" | "inner-circle";

/** Primitivas 2D em milímetros para as vistas ortográficas. */
export type Prim =
  | {
      k: "poly";
      pts: [number, number][];
      closed?: boolean;
      fill?: boolean;
      dash?: boolean;
      role?: PrimRole;
    }
  | {
      k: "circle";
      cx: number;
      cy: number;
      r: number;
      dash?: boolean;
      fill?: boolean;
      role?: PrimRole;
    }
  | {
      k: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      dash?: boolean;
      fill?: boolean;
      role?: PrimRole;
    };

export type OrthoViews = {
  /** Vista frontal: origem no centro da base, Y para cima (mm). */
  front: Prim[];
  /** Planta: origem no centro, Y = profundidade (mm). */
  plan: Prim[];
  /** Cotas exibidas: chave do parâmetro + rótulo. */
  dims: { key: keyof WireParams; label: string; unit?: string }[];
};

const rect = (
  w: number,
  h: number,
  cx = 0,
  cy = 0,
  dash = false,
  fill = true,
  role: PrimRole = dash ? "inner" : "outer",
): Prim => ({
  k: "rect",
  x: cx - w / 2,
  y: cy - h / 2,
  w,
  h,
  dash,
  fill,
  role,
});

const trapezoid = (
  wb: number,
  wt: number,
  h: number,
  off = 0,
  fill = true,
  role: PrimRole = "outer",
): Prim => ({
  k: "poly",
  pts: [
    [-wb / 2, 0],
    [wb / 2, 0],
    [wt / 2 + off, h],
    [-wt / 2 + off, h],
  ],
  closed: true,
  fill,
  role,
});

/** Constrói vista frontal + planta coerentes com a geometria real de cada peça. */
export function buildViews(slug: string, p: WireParams): OrthoViews {
  const d1 = p.d1;
  const d2 = p.d2;
  const h = p.h;
  const e = p.e ?? 0;
  const r1 = d1 / 2;
  const r2 = d2 / 2;

  const dimsFull: OrthoViews["dims"] = [
    { key: "d1", label: "Ø/A base", unit: "mm" },
    { key: "d2", label: "Ø/A topo", unit: "mm" },
    { key: "h", label: "H altura", unit: "mm" },
  ];
  const withE: OrthoViews["dims"] = [...dimsFull, { key: "e", label: "E offset", unit: "mm" }];

  const circPlan = (
    r: number,
    cx = 0,
    cy = 0,
    dash = false,
    fill = true,
    role: PrimRole = dash ? "inner-circle" : "outer",
  ): Prim => ({
    k: "circle",
    cx,
    cy,
    r,
    dash,
    fill,
    role,
  });

  switch (slug) {
    case "cilindro":
    case "dutos":
      return {
        front: [rect(d1, h, 0, h / 2)],
        plan: [circPlan(r1), circPlan(Math.max(r1 - d1 * 0.05, 1), 0, 0, true, false)],
        dims: [
          { key: "d1", label: "ØD", unit: "mm" },
          { key: "h", label: "H", unit: "mm" },
        ],
      };

    case "cone":
      return {
        front: [trapezoid(d1, 0, h)],
        plan: [circPlan(r1), circPlan(r1 * 0.06, 0, 0, true, false)],
        dims: [
          { key: "d1", label: "ØD", unit: "mm" },
          { key: "h", label: "H", unit: "mm" },
        ],
      };

    case "tronco-de-cone":
    case "reducao-circular":
      return {
        front: [trapezoid(d1, d2, h)],
        plan: [circPlan(r1), circPlan(r2, 0, 0, true, false)],
        dims: dimsFull,
      };

    case "cone-excentrico":
      return {
        front: [trapezoid(d1, d2, h, e || r1 - r2)],
        plan: [circPlan(r1), circPlan(r2, e || r1 - r2, 0, true, false)],
        dims: withE,
      };

    case "quadrado-redondo":
      return {
        front: [trapezoid(d1, d2, h, e)],
        plan: [rect(d1, d1), circPlan(r2, e, 0, true, false)],
        dims: withE,
      };

    case "redondo-quadrado":
    case "transicoes":
      return {
        front: [trapezoid(d1, d2, h, e)],
        plan: [circPlan(r1), rect(d2, d2, e, 0, true, false)],
        dims: withE,
      };

    case "boca-de-lobo":
      return {
        front: [
          {
            k: "poly",
            pts: [
              [-r1, 0],
              [r1, 0],
              [r1, h],
              [-r1, h * 0.35],
            ],
            closed: true,
            fill: true,
            role: "outer",
          },
        ],
        plan: [circPlan(r1), circPlan(Math.max(r1 * 0.92, 1), 0, 0, true, false)],
        dims: [
          { key: "d1", label: "ØD1", unit: "mm" },
          { key: "d2", label: "ØD2", unit: "mm" },
          { key: "ang", label: "α", unit: "°" },
        ],
      };

    case "te":
    case "interseccoes":
      return {
        front: [
          rect(d1, h, 0, h / 2),
          rect(h * 0.45, d2, d1 / 2 + (h * 0.45) / 2, h / 2, false, true),
        ],
        plan: [circPlan(r1), rect(h * 0.45, d2, d1 / 2 + (h * 0.45) / 2, 0, true, false)],
        dims: dimsFull,
      };

    case "y":
      return {
        front: [
          rect(d1, h * 0.45, 0, (h * 0.45) / 2),
          trapezoid(d1, d2 * 2.2, h * 0.55, 0, false),
          {
            k: "poly",
            pts: [
              [-r1 * 0.8 - r2, h],
              [-r1 * 0.8 - r2, h * 0.45],
            ],
            closed: false,
            role: "outer",
          },
          {
            k: "poly",
            pts: [
              [r1 * 0.8 + r2, h],
              [r1 * 0.8 + r2, h * 0.45],
            ],
            closed: false,
            role: "outer",
          },
        ],
        plan: [
          circPlan(r1),
          circPlan(r2, -r1 * 0.8, 0, true, false),
          circPlan(r2, r1 * 0.8, 0, true, false),
        ],
        dims: dimsFull,
      };

    case "curva-de-gomos": {
      const D = Math.max(10, d2 || 300);
      const rb = D / 2;
      const R = Math.max(rb * 1.02, d1 || 450);
      const ang = Math.min(180, Math.max(15, p.ang ?? 90));
      const g = Math.max(2, Math.round(p.n ?? 4));
      const divisions = Math.max(3, Math.round(p.divisions ?? (p.seg ? p.seg / 2 : 12)));
      const tWall = Math.max(rb * 0.065, Math.min(rb * 0.16, p.t ?? 3));
      const rbIn = Math.max(rb * 0.1, rb - tWall);

      const model = elbowModel({
        diameter: D,
        radius: R,
        angleDeg: ang,
        gores: g,
        divisions,
      });

      const k = 1 / Math.max(Math.cos(model.beta), 0.15);
      const extOut: [number, number][] = [];
      const intOut: [number, number][] = [];
      const extIn: [number, number][] = [];
      const intIn: [number, number][] = [];
      const jointPlanes: Prim[] = [];
      const centerPts: [number, number][] = [];

      model.centerline.forEach((c, j) => {
        const prev = model.segments[j - 1];
        const next = model.segments[j];
        const dirs = [prev?.rotationDeg, next?.rotationDeg].filter(
          (x) => x !== undefined,
        ) as number[];
        const phiM = ((dirs.reduce((s, x) => s + x, 0) / dirs.length) * Math.PI) / 180;
        const mitred = dirs.length === 2;
        const ax = mitred ? k : 1;

        const pExt: [number, number] = [
          c.x + rb * ax * Math.sin(phiM),
          c.y - rb * ax * Math.cos(phiM),
        ];
        const pInt: [number, number] = [
          c.x - rb * ax * Math.sin(phiM),
          c.y + rb * ax * Math.cos(phiM),
        ];
        const pExtIn: [number, number] = [
          c.x + rbIn * ax * Math.sin(phiM),
          c.y - rbIn * ax * Math.cos(phiM),
        ];
        const pIntIn: [number, number] = [
          c.x - rbIn * ax * Math.sin(phiM),
          c.y + rbIn * ax * Math.cos(phiM),
        ];

        extOut.push(pExt);
        intOut.push(pInt);
        extIn.push(pExtIn);
        intIn.push(pIntIn);
        centerPts.push([c.x, c.y]);

        if (mitred) {
          jointPlanes.push({
            k: "poly",
            pts: [pExt, pInt],
            closed: false,
            fill: false,
            role: "joint",
          });
        }
      });

      return {
        front: [
          {
            k: "poly",
            pts: [...extOut, ...intOut.slice().reverse()],
            closed: true,
            fill: true,
            role: "outer",
          },
          {
            k: "poly",
            pts: extIn,
            closed: false,
            fill: false,
            role: "inner",
          },
          {
            k: "poly",
            pts: intIn,
            closed: false,
            fill: false,
            role: "inner",
          },
          ...jointPlanes,
          {
            k: "poly",
            pts: centerPts,
            closed: false,
            fill: false,
            dash: true,
            role: "centerline",
          },
        ],
        plan: [
          circPlan(rb, 0, 0, false, true, "outer"),
          circPlan(rbIn, 0, 0, true, false, "inner-circle"),
          {
            k: "poly",
            pts: [
              [-rb * 1.15, 0],
              [rb * 1.15, 0],
            ],
            closed: false,
            fill: false,
            dash: true,
            role: "centerline",
          },
          {
            k: "poly",
            pts: [
              [0, -rb * 1.15],
              [0, rb * 1.15],
            ],
            closed: false,
            fill: false,
            dash: true,
            role: "centerline",
          },
        ],
        dims: [
          { key: "d2", label: "ØD", unit: "mm" },
          { key: "d1", label: "R", unit: "mm" },
          { key: "ang", label: "α", unit: "°" },
          { key: "n", label: "n", unit: "un" },
        ],
      };
    }

    case "flanges":
      return {
        front: [rect(d1, h * 0.12, 0, (h * 0.12) / 2)],
        plan: [
          circPlan(r1),
          circPlan(r2, 0, 0, true, false),
          ...Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const cx = ((r1 + r2) / 2) * Math.cos(a);
            const cy = ((r1 + r2) / 2) * Math.sin(a);
            return circPlan(r1 * 0.08, cx, cy, false, false);
          }),
        ],
        dims: [
          { key: "d1", label: "Ø externo", unit: "mm" },
          { key: "d2", label: "Ø furo", unit: "mm" },
        ],
      };

    case "tampas":
      return {
        front: [rect(d1, h * 0.15, 0, (h * 0.15) / 2), rect(d1 * 0.98, h * 0.04, 0, h * 0.17)],
        plan: [circPlan(r1), circPlan(r1 * 0.94, 0, 0, true, false)],
        dims: [
          { key: "d1", label: "Ø tampa", unit: "mm" },
          { key: "h", label: "H aba", unit: "mm" },
        ],
      };

    case "calotas": {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI - (i / 24) * Math.PI;
        pts.push([r1 * Math.cos(a), h * Math.sin(a)]);
      }
      return {
        front: [{ k: "poly", pts, closed: true, fill: true, role: "outer" }],
        plan: [circPlan(r1), circPlan(r1 * 0.55, 0, 0, true, false)],
        dims: [
          { key: "d1", label: "Ø base", unit: "mm" },
          { key: "h", label: "H calota", unit: "mm" },
        ],
      };
    }

    case "chamines":
      return {
        front: [
          trapezoid(d1, d1 * 0.85, h / 2),
          {
            k: "poly",
            pts: [
              [-(d1 * 0.85) / 2, h / 2],
              [(d1 * 0.85) / 2, h / 2],
              [d2 / 2, h],
              [-d2 / 2, h],
            ],
            closed: true,
            fill: true,
            role: "outer",
          },
        ],
        plan: [circPlan(r1), circPlan(r2, 0, 0, true, false)],
        dims: dimsFull,
      };

    default:
      return {
        front: [trapezoid(d1, d2, h, e)],
        plan: [circPlan(r1), circPlan(r2, e, 0, true, false)],
        dims: withE,
      };
  }
}
