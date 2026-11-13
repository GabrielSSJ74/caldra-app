import { useMemo } from "react";
import { elbowModel } from "@/lib/geometry/elbowSegments";
import { foldRef, type GeometryRef } from "@/lib/geometry/refs";
import { buildViews, type Prim } from "@/lib/viz3d/views";
import type { WireParams } from "@/lib/viz3d/wire";

type Props = {
  slug: string;
  params: WireParams;
  highlight?: keyof WireParams | null;
  className?: string;
  showGeneratrices?: boolean;
  selectedRef?: GeometryRef | null;
  onSelectRef?: ((ref: GeometryRef | null) => void) | undefined;
};

const W = 460;
const H = 252;

function bboxOf(prims: Prim[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.k === "poly") p.pts.forEach(([x, y]) => acc(x, y));
    else if (p.k === "circle") {
      acc(p.cx - p.r, p.cy - p.r);
      acc(p.cx + p.r, p.cy + p.r);
    } else {
      acc(p.x, p.y);
      acc(p.x + p.w, p.y + p.h);
    }
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

type Generatrix2D = {
  id: string;
  index: number;
  numberLabel: string;
  label: string;
  frontPts: [number, number][];
  plan: { x1: number; y1: number; x2: number; y2: number; lx?: number; ly?: number };
};

/** Gera as geratrizes técnicas em 2D proporcionais aos parâmetros físicos (mm) e às Divisões do traçado. */
export function buildGeneratrices2D(slug: string, p: WireParams): Generatrix2D[] {
  const d1 = p.d1;
  const d2 = p.d2;
  const h = p.h;
  const e = p.e ?? 0;
  const r1 = d1 / 2;
  const r2 = d2 / 2;
  const N = Math.min(
    24,
    Math.max(3, Math.round(p.divisions ?? (p.seg ? Math.round(p.seg / 2) : 12))),
  );
  const gens: Generatrix2D[] = [];

  switch (slug) {
    case "cone": {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, 0],
            [0, h],
          ],
          plan: {
            x1: 0,
            y1: 0,
            x2: bx,
            y2: by,
            lx: r1 * 1.15 * Math.cos(ang),
            ly: r1 * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
    case "tronco-de-cone":
    case "reducao-circular":
    case "chamines": {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        const tx = r2 * Math.cos(ang);
        const ty = r2 * Math.sin(ang);
        const rMax = Math.max(r1, r2);
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, 0],
            [tx, h],
          ],
          plan: {
            x1: bx,
            y1: by,
            x2: tx,
            y2: ty,
            lx: rMax * 1.15 * Math.cos(ang),
            ly: rMax * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
    case "cone-excentrico": {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        const tx = r2 * Math.cos(ang) + e;
        const ty = r2 * Math.sin(ang);
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, 0],
            [tx, h],
          ],
          plan: {
            x1: bx,
            y1: by,
            x2: tx,
            y2: ty,
            lx: r1 * 1.15 * Math.cos(ang),
            ly: r1 * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
    case "cilindro":
    case "dutos": {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, 0],
            [bx, h],
          ],
          plan: {
            x1: 0,
            y1: 0,
            x2: bx,
            y2: by,
            lx: r1 * 1.15 * Math.cos(ang),
            ly: r1 * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
    case "boca-de-lobo": {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        const saddleY = h * (0.35 + 0.65 * ((1 - Math.cos(ang)) / 2));
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, saddleY],
            [bx, h],
          ],
          plan: {
            x1: 0,
            y1: 0,
            x2: bx,
            y2: by,
            lx: r1 * 1.15 * Math.cos(ang),
            ly: r1 * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
    case "curva-de-gomos": {
      const D = Math.max(10, d2 || 300);
      const rb = D / 2;
      const R = Math.max(rb * 1.02, d1 || 450);
      const ang = Math.min(180, Math.max(15, p.ang ?? 90));
      const g = Math.max(2, Math.round(p.n ?? 4));

      const model = elbowModel({
        diameter: D,
        radius: R,
        angleDeg: ang,
        gores: g,
        divisions: N,
      });
      const k = 1 / Math.max(Math.cos(model.beta), 0.15);

      const joints = model.centerline.map((c, j) => {
        const prev = model.segments[j - 1];
        const next = model.segments[j];
        const dirs = [prev?.rotationDeg, next?.rotationDeg].filter(
          (x) => x !== undefined,
        ) as number[];
        const phiM = ((dirs.reduce((s, x) => s + x, 0) / dirs.length) * Math.PI) / 180;
        const mitred = dirs.length === 2;
        const ax = mitred ? k : 1;
        return { cx: c.x, cy: c.y, phiM, ax };
      });

      for (let i = 0; i < N; i++) {
        const theta = (i / N) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        const frontPts: [number, number][] = joints.map((jt) => {
          const s = rb * jt.ax * sinT;
          return [jt.cx - s * Math.sin(jt.phiM), jt.cy + s * Math.cos(jt.phiM)];
        });

        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts,
          plan: {
            x1: 0,
            y1: 0,
            x2: rb * cosT,
            y2: rb * sinT,
            lx: rb * 1.18 * cosT,
            ly: rb * 1.18 * sinT,
          },
        });
      }
      break;
    }
    default: {
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const bx = r1 * Math.cos(ang);
        const by = r1 * Math.sin(ang);
        const tx = r2 * Math.cos(ang) + e;
        const ty = r2 * Math.sin(ang);
        gens.push({
          id: `gen-${i}`,
          index: i,
          numberLabel: `${i + 1}`,
          label: `G${i + 1}`,
          frontPts: [
            [bx, 0],
            [tx, h],
          ],
          plan: {
            x1: bx,
            y1: by,
            x2: tx,
            y2: ty,
            lx: r1 * 1.15 * Math.cos(ang),
            ly: r1 * 1.15 * Math.sin(ang),
          },
        });
      }
      break;
    }
  }
  return gens;
}

/**
 * Vistas ortográficas técnicas (VISTA FRONTAL + VISTA SUPERIOR) de fonte única,
 * com fundo de estúdio limpo (sem grid), hierarquia CAD/ABNT, auto-fit 1:1,
 * geratrizes numeradas e cotas dinâmicas em tempo real.
 */
export function SchematicViews({
  slug,
  params,
  highlight = null,
  className,
  showGeneratrices = true,
  selectedRef = null,
  onSelectRef,
}: Props) {
  const views = useMemo(() => buildViews(slug, params), [slug, params]);
  const generatrices = useMemo(() => buildGeneratrices2D(slug, params), [slug, params]);

  const getTransformers = (
    prims: Prim[],
    box: { x: number; y: number; w: number; h: number },
    flipY: boolean,
  ) => {
    const bb = bboxOf(prims);
    const gw = Math.max(bb.maxX - bb.minX, 1);
    const gh = Math.max(bb.maxY - bb.minY, 1);
    const s = Math.min(box.w / gw, box.h / gh);
    const ox = box.x + box.w / 2 - ((bb.minX + bb.maxX) / 2) * s;
    const oy = box.y + box.h / 2 + (flipY ? ((bb.minY + bb.maxY) / 2) * s : 0);
    const X = (x: number) => ox + x * s;
    const Y = (y: number) =>
      flipY ? oy - y * s : box.y + box.h / 2 + (y - (bb.minY + bb.maxY) / 2) * s;
    return { X, Y, s, bb };
  };

  const frontBox = { x: 22, y: 18, w: 192, h: 168 };
  const planBox = { x: 256, y: 22, w: 172, h: 160 };

  const frontT = getTransformers(views.front, frontBox, true);
  const planT = getTransformers(views.plan, planBox, false);

  const styleForPrim = (p: Prim) => {
    const role = p.role ?? ("dash" in p && p.dash ? "inner" : "outer");
    if (role === "centerline") {
      return {
        stroke: "#94A3B8",
        strokeWidth: 0.95,
        strokeOpacity: 0.9,
        strokeDasharray: "10 4 2 4",
        fill: "none",
        fillOpacity: 0,
        strokeLinejoin: "round" as const,
      };
    }
    if (role === "joint") {
      return {
        stroke: "#7DD3FC",
        strokeWidth: 1.4,
        strokeOpacity: 0.95,
        strokeDasharray: undefined,
        fill: "none",
        fillOpacity: 0,
        strokeLinejoin: "round" as const,
      };
    }
    if (role === "inner-circle") {
      return {
        stroke: "#2DD4BF",
        strokeWidth: 1.15,
        strokeOpacity: 0.85,
        strokeDasharray: "5 3",
        fill: "none",
        fillOpacity: 0,
        strokeLinejoin: "round" as const,
      };
    }
    if (role === "inner") {
      return {
        stroke: "#0284C7",
        strokeWidth: 1.1,
        strokeOpacity: 0.65,
        strokeDasharray: "dash" in p && p.dash ? "5 3" : undefined,
        fill: "none",
        fillOpacity: 0,
        strokeLinejoin: "round" as const,
      };
    }
    return {
      stroke: "#38BDF8",
      strokeWidth: 2.0,
      strokeOpacity: 1,
      strokeDasharray: undefined,
      fill: p.fill ? "#38BDF8" : "none",
      fillOpacity: p.fill ? 0.05 : 0,
      strokeLinejoin: "round" as const,
    };
  };

  const renderPrims = (
    prims: Prim[],
    { X, Y, s }: { X: (x: number) => number; Y: (y: number) => number; s: number },
    flipY: boolean,
  ) => {
    return prims.map((p, i) => {
      const common = styleForPrim(p);
      if (p.k === "poly")
        return (
          <path
            key={i}
            {...common}
            data-role={p.role ?? "outer"}
            d={
              p.pts
                .map(
                  (pt, j) => `${j === 0 ? "M" : "L"}${X(pt[0]).toFixed(2)} ${Y(pt[1]).toFixed(2)}`,
                )
                .join(" ") + (p.closed === false ? "" : " Z")
            }
          />
        );
      if (p.k === "circle")
        return (
          <circle
            key={i}
            {...common}
            data-role={p.role ?? "outer"}
            cx={X(p.cx).toFixed(2)}
            cy={Y(p.cy).toFixed(2)}
            r={(p.r * s).toFixed(2)}
          />
        );
      return (
        <rect
          key={i}
          {...common}
          data-role={p.role ?? "outer"}
          x={X(p.x).toFixed(2)}
          y={(flipY ? Y(p.y + p.h) : Y(p.y)).toFixed(2)}
          width={(p.w * s).toFixed(2)}
          height={(p.h * s).toFixed(2)}
        />
      );
    });
  };

  const labelStep = generatrices.length > 16 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className ?? "h-full w-full select-none"}
      role="img"
      aria-label="Vistas técnicas CAD 2D: vista frontal e vista superior"
      onClick={() => onSelectRef?.(null)}
    >
      {/* Fundo técnico limpo de estúdio (Zero Grid) */}
      <rect width={W} height={H} fill="#0D1322" />

      {/* Divisor vertical sutil entre Vista Frontal e Vista Superior */}
      <line
        x1={232}
        y1={14}
        x2={232}
        y2={208}
        stroke="rgba(148, 163, 184, 0.14)"
        strokeWidth="1"
      />

      {/* VISTA FRONTAL */}
      <g data-view="vista-frontal">
        {/* Geratrizes interativas na vista frontal (renderizadas sob os contornos principais) */}
        {showGeneratrices && (
          <g data-layer="generatrices-front">
            {generatrices.map((g, idx) => {
              const ptsScreen = g.frontPts.map(
                ([px, py]) =>
                  [Number(frontT.X(px).toFixed(2)), Number(frontT.Y(py).toFixed(2))] as const,
              );
              const dPath = ptsScreen
                .map(([x, y], j) => `${j === 0 ? "M" : "L"}${x} ${y}`)
                .join(" ");
              const isSelected = selectedRef === foldRef(g.index);
              const firstPt = ptsScreen[0]!;
              const lastPt = ptsScreen[ptsScreen.length - 1]!;
              const mx = Number(((firstPt[0] + lastPt[0]) / 2).toFixed(2));
              const my = Number(((firstPt[1] + lastPt[1]) / 2).toFixed(2));
              const showNum = idx % labelStep === 0;

              return (
                <g key={`front-${g.id}`}>
                  <path
                    d={dPath}
                    fill="none"
                    stroke={isSelected ? "#38BDF8" : "rgba(147, 197, 253, 0.70)"}
                    strokeWidth={isSelected ? 1.8 : 0.85}
                  />
                  <path
                    d={dPath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRef?.(isSelected ? null : foldRef(g.index));
                    }}
                  >
                    <title>{`Geratriz ${g.label}`}</title>
                  </path>
                  {showNum && idx < Math.ceil(generatrices.length / 2) + 1 && (
                    <text
                      x={firstPt[0]}
                      y={firstPt[1] + 9}
                      textAnchor="middle"
                      fontSize="6.5"
                      fontFamily="var(--font-mono)"
                      fill="#93C5FD"
                      opacity="0.85"
                    >
                      {g.numberLabel}
                    </text>
                  )}
                  {isSelected && (
                    <g transform={`translate(${mx}, ${my})`} pointerEvents="none">
                      <rect
                        x={-34}
                        y={-9}
                        width={68}
                        height={18}
                        rx={4}
                        fill="#0F172A"
                        stroke="#38BDF8"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize={8}
                        fontFamily="var(--font-mono)"
                        fill="#38BDF8"
                        fontWeight="bold"
                      >
                        Geratriz {g.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {renderPrims(views.front, frontT, true)}

        {slug !== "curva-de-gomos" && (
          <line
            x1={frontBox.x + frontBox.w / 2}
            y1={14}
            x2={frontBox.x + frontBox.w / 2}
            y2={194}
            stroke="#94A3B8"
            strokeWidth="0.95"
            strokeDasharray="10 4 2 4"
          />
        )}

        <text
          x={frontBox.x + frontBox.w / 2}
          y={214}
          fill="#94A3B8"
          fontSize="8.5"
          fontWeight="600"
          letterSpacing="0.08em"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          VISTA FRONTAL
        </text>
      </g>

      {/* VISTA SUPERIOR / PLANTA */}
      <g data-view="vista-superior">
        {/* Geratrizes interativas e numeração técnica ordenada na vista superior */}
        {showGeneratrices && (
          <g data-layer="generatrices-plan">
            {generatrices.map((g, idx) => {
              const x1 = Number(planT.X(g.plan.x1).toFixed(2));
              const y1 = Number(planT.Y(g.plan.y1).toFixed(2));
              const x2 = Number(planT.X(g.plan.x2).toFixed(2));
              const y2 = Number(planT.Y(g.plan.y2).toFixed(2));
              const lx = g.plan.lx !== undefined ? Number(planT.X(g.plan.lx).toFixed(2)) : x2;
              const ly = g.plan.ly !== undefined ? Number(planT.Y(g.plan.ly).toFixed(2)) : y2;
              const isSelected = selectedRef === foldRef(g.index);
              const mx = Number(((x1 + x2) / 2).toFixed(2));
              const my = Number(((y1 + y2) / 2).toFixed(2));
              const showNum = idx % labelStep === 0;

              return (
                <g key={`plan-${g.id}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isSelected ? "#38BDF8" : "rgba(147, 197, 253, 0.70)"}
                    strokeWidth={isSelected ? 1.8 : 0.85}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={10}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRef?.(isSelected ? null : foldRef(g.index));
                    }}
                  >
                    <title>{`Geratriz ${g.label}`}</title>
                  </line>
                  {showNum && (
                    <text
                      x={lx}
                      y={ly + 2.5}
                      textAnchor="middle"
                      fontSize="7"
                      fontWeight="600"
                      fontFamily="var(--font-mono)"
                      fill={isSelected ? "#38BDF8" : "#93C5FD"}
                      data-testid={`gen-num-${g.numberLabel}`}
                    >
                      {g.numberLabel}
                    </text>
                  )}
                  {isSelected && (
                    <g transform={`translate(${mx}, ${my})`} pointerEvents="none">
                      <rect
                        x={-34}
                        y={-9}
                        width={68}
                        height={18}
                        rx={4}
                        fill="#0F172A"
                        stroke="#38BDF8"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize={8}
                        fontFamily="var(--font-mono)"
                        fill="#38BDF8"
                        fontWeight="bold"
                      >
                        Geratriz {g.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {renderPrims(views.plan, planT, false)}

        <text
          x={planBox.x + planBox.w / 2}
          y={214}
          fill="#94A3B8"
          fontSize="8.5"
          fontWeight="600"
          letterSpacing="0.08em"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          VISTA SUPERIOR
        </text>
      </g>

      {/* COTAS DE REFERÊNCIA DINÂMICAS */}
      <g data-layer="dynamic-cotas" transform="translate(16, 226)">
        {views.dims.map((dim, idx) => {
          const val = params[dim.key];
          const formattedVal =
            typeof val === "number" && Number.isFinite(val) ? Math.round(val * 10) / 10 : "—";
          const unitSuffix = dim.unit === "°" ? "°" : "";
          const textStr = `${dim.label} = ${formattedVal}${unitSuffix}`;
          const isHighlighted = highlight === dim.key;
          const badgeW = Math.max(76, textStr.length * 6.2 + 16);
          const xOffset = idx * 108;

          return (
            <g key={String(dim.key)} transform={`translate(${xOffset}, 0)`}>
              <rect
                x={0}
                y={0}
                width={badgeW}
                height={18}
                rx={5}
                fill={isHighlighted ? "rgba(56, 189, 248, 0.16)" : "rgba(17, 25, 43, 0.92)"}
                stroke={isHighlighted ? "#38BDF8" : "rgba(148, 163, 184, 0.24)"}
                strokeWidth={1}
              />
              <text
                x={badgeW / 2}
                y={12}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fontFamily="var(--font-mono)"
                fill={isHighlighted ? "#38BDF8" : "#E2E8F0"}
              >
                {textStr}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
