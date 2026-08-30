import { useEffect, useMemo, useRef, useState } from "react";
import { project, type Camera, type WireModel } from "@/lib/viz3d/wire";
import { cn } from "@/lib/utils";

type Props = {
  model: WireModel;
  className?: string;
  interactive?: boolean;
  autoSpin?: boolean;
  /** progresso 0..1 de "abertura" da peça (3D → planificação) */
  unfold?: number;
};

const VB = 200;

/** Visualização vetorial 3D: wireframe técnico com superfícies translúcidas. */
export function Wire3D({
  model,
  className,
  interactive = false,
  autoSpin = false,
  unfold = 0,
}: Props) {
  const [cam, setCam] = useState<Camera>({ yaw: 0.7, pitch: 0.42, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const host = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!autoSpin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      setCam((c) => ({ ...c, yaw: c.yaw + dt * 0.25 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoSpin]);

  useEffect(() => {
    const el = host.current;
    if (!el || !interactive) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1);
      setCam((c) => ({ ...c, zoom: Math.min(4, Math.max(0.35, c.zoom * Math.exp(-dy * 0.0015))) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive]);

  const scale = (VB * 0.42) / (model.size || 1);
  const k = 1 - unfold * 0.9;

  const { faces, edges } = useMemo(() => {
    const f = model.faces
      .map((poly) => {
        const pts = poly.map((p) =>
          project({ x: p.x, y: p.y * k, z: p.z }, cam, scale),
        );
        const depth = pts.reduce((s, p) => s + p.depth, 0) / pts.length;
        return { d: pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "), depth };
      })
      .sort((a, b) => a.depth - b.depth);
    const e = model.edges.map(([a, b]) => {
      const pa = project({ x: a.x, y: a.y * k, z: a.z }, cam, scale);
      const pb = project({ x: b.x, y: b.y * k, z: b.z }, cam, scale);
      return { pa, pb, depth: (pa.depth + pb.depth) / 2 };
    });
    return { faces: f, edges: e };
  }, [model, cam, scale, k]);

  const maxDepth = Math.max(1, ...edges.map((e) => Math.abs(e.depth)));

  return (
    <svg
      ref={host}
      viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
      className={cn("touch-none select-none", interactive && "cursor-grab active:cursor-grabbing", className)}
      role="img"
      aria-label="Modelo tridimensional vetorial"
      onPointerDown={(ev) => {
        if (!interactive) return;
        drag.current = { x: ev.clientX, y: ev.clientY };
        ev.currentTarget.setPointerCapture(ev.pointerId);
      }}
      onPointerMove={(ev) => {
        if (!drag.current) return;
        const dx = ev.clientX - drag.current.x;
        const dy = ev.clientY - drag.current.y;
        drag.current = { x: ev.clientX, y: ev.clientY };
        setCam((c) => ({
          ...c,
          yaw: c.yaw + dx * 0.008,
          pitch: Math.max(-1.3, Math.min(1.3, c.pitch + dy * 0.006)),
        }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      {faces.map((f, i) => (
        <polygon
          key={`f${i}`}
          points={f.d}
          className="fill-accent"
          fillOpacity={(0.05 + 0.06 * ((f.depth + maxDepth) / (2 * maxDepth))).toFixed(4)}
          stroke="none"
        />
      ))}
      {edges.map((e, i) => (
        <line
          key={`e${i}`}
          x1={e.pa.x.toFixed(3)}
          y1={e.pa.y.toFixed(3)}
          x2={e.pb.x.toFixed(3)}
          y2={e.pb.y.toFixed(3)}
          stroke="currentColor"
          strokeWidth={0.55}
          strokeOpacity={(0.25 + 0.6 * ((e.depth + maxDepth) / (2 * maxDepth))).toFixed(4)}
          strokeLinecap="round"
        />
      ))}

    </svg>
  );
}
