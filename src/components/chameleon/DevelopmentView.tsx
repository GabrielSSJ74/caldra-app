import { forwardRef } from "react";
import type { DevelopmentPattern } from "@/lib/geometry/types";

type Props = {
  pattern: DevelopmentPattern;
  showFolds?: boolean;
  showPoints?: boolean;
};

/** Renderiza o desenvolvimento planificado em escala real (mm → unidades SVG). */
export const DevelopmentView = forwardRef<SVGSVGElement, Props>(function DevelopmentView(
  { pattern, showFolds = true, showPoints = true },
  ref,
) {
  const { minX, minY, maxX, maxY } = pattern.bounds;
  const pad = Math.max((maxX - minX) * 0.08, 20);
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const path =
    pattern.outline.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(" ") +
    " Z";

  return (
    <svg
      ref={ref}
      viewBox={`${minX - pad} ${-maxY - pad} ${w} ${h}`}
      className="h-full w-full"
      role="img"
      aria-label="Desenvolvimento planificado"
    >
      <rect
        x={minX - pad}
        y={-maxY - pad}
        width={w}
        height={h}
        fill="var(--background)"
        fillOpacity="0"
      />
      {showFolds &&
        pattern.foldLines.map((s, i) => (
          <line
            key={i}
            x1={s.a.x}
            y1={-s.a.y}
            x2={s.b.x}
            y2={-s.b.y}
            stroke="var(--accent2)"
            strokeOpacity="0.55"
            strokeWidth={w / 400}
            strokeDasharray={`${w / 90} ${w / 160}`}
          />
        ))}
      <path
        d={path}
        fill="var(--accent)"
        fillOpacity="0.06"
        stroke="var(--accent)"
        strokeWidth={w / 250}
        strokeLinejoin="round"
      />
      {showPoints &&
        pattern.points.map((pt) => (
          <g key={pt.id}>
            <circle cx={pt.p.x} cy={-pt.p.y} r={w / 200} fill="var(--warn)" />
            <text
              x={pt.p.x}
              y={-pt.p.y + w / 45}
              fill="var(--warn)"
              fontSize={w / 45}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {pt.id}
            </text>
          </g>
        ))}
    </svg>
  );
});
