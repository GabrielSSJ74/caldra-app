import { useMemo } from "react";
import { buildViews, type Prim } from "@/lib/viz3d/views";
import type { WireParams } from "@/lib/viz3d/wire";

type Props = {
  slug: string;
  params: WireParams;
  highlight?: keyof WireParams | null;
  className?: string;
};

const W = 440;
const H = 240;

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

/**
 * Vistas ortográficas técnicas (VISTA FRONTAL + VISTA SUPERIOR) geradas
 * a partir da geometria da peça — mesmo padrão do motor de cálculo.
 */
export function SchematicViews({ slug, params, highlight = null, className }: Props) {
  const views = useMemo(() => buildViews(slug, params), [slug, params]);

  const draw = (
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
    const Y = (y: number) => (flipY ? oy - y * s : box.y + box.h / 2 + (y - (bb.minY + bb.maxY) / 2) * s);

    return prims.map((p, i) => {
      const common = {
        stroke: "dash" in p && p.dash ? "var(--holo, #00FFEF)" : "var(--accent)",
        strokeWidth: p.k === "poly" || !("dash" in p) || !p.dash ? 1.4 : 1,
        strokeOpacity: "dash" in p && p.dash ? 0.75 : 1,
        strokeDasharray: "dash" in p && p.dash ? "5 3" : undefined,
        fill:
          ("fill" in p && p.fill) ?? false
            ? "dash" in p && p.dash
              ? "var(--holo, #00FFEF)"
              : "var(--accent)"
            : "none",
        fillOpacity: 0.07,
        strokeLinejoin: "round" as const,
      };
      if (p.k === "poly")
        return (
          <path
            key={i}
            {...common}
            d={
              p.pts.map((pt, j) => `${j === 0 ? "M" : "L"}${X(pt[0]).toFixed(2)} ${Y(pt[1]).toFixed(2)}`).join(" ") +
              (p.closed === false ? "" : " Z")
            }
          />
        );
      if (p.k === "circle")
        return (
          <circle key={i} {...common} cx={X(p.cx).toFixed(2)} cy={Y(p.cy).toFixed(2)} r={(p.r * s).toFixed(2)} />
        );
      return (
        <rect
          key={i}
          {...common}
          x={X(p.x).toFixed(2)}
          y={(flipY ? Y(p.y + p.h) : Y(p.y)).toFixed(2)}
          width={(p.w * s).toFixed(2)}
          height={(p.h * s).toFixed(2)}
        />
      );
    });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className ?? "h-full w-full"}
      role="img"
      aria-label="Vistas técnicas: frontal e superior"
    >
      <defs>
        <pattern id={`sv-grid-${slug}`} width="11" height="11" patternUnits="userSpaceOnUse">
          <path d="M11 0H0v11" fill="none" stroke="var(--grid-line)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#sv-grid-${slug})`} />

      <g>
        {draw(views.front, { x: 26, y: 22, w: 176, h: 168 }, true)}
        <line
          x1={114}
          y1={16}
          x2={114}
          y2={198}
          stroke="var(--muted-foreground)"
          strokeWidth="0.6"
          strokeDasharray="6 3 1 3"
        />
        <text x={114} y={222} fill="var(--muted-foreground)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">
          VISTA FRONTAL
        </text>
      </g>

      <g>
        {draw(views.plan, { x: 246, y: 22, w: 176, h: 168 }, false)}
        <text x={334} y={222} fill="var(--muted-foreground)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">
          VISTA SUPERIOR
        </text>
      </g>

    </svg>
  );
}
