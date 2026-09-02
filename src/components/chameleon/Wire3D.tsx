import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/lib/geometry/types";
import type { Camera, WireModel } from "@/lib/viz3d/wire";
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

/** Rotação yaw/pitch → espaço de câmera (z cresce em direção ao observador). */
function toCam(p: Vec3, cam: Camera): Vec3 {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 };
}

const LIGHT = { x: -0.35, y: 0.62, z: 0.7 };

/** Render sólido sombreado (estilo CAD/SolidWorks): faces em aço + arestas finas. */
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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const { faces, edges } = useMemo(() => {
    const kk = scale * cam.zoom;
    const cache = new Map<string, Vec3>();
    const cp = (p: Vec3) => {
      const key = `${p.x}|${p.y}|${p.z}`;
      let c = cache.get(key);
      if (!c) {
        c = toCam({ x: p.x, y: p.y * k, z: p.z }, cam);
        cache.set(key, c);
      }
      return c;
    };

    const f = model.faces
      .map((poly) => {
        const cs = poly.map(cp);
        // Newell normal em espaço de câmera
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let i = 0; i < cs.length; i++) {
          const a = cs[i]!;
          const b = cs[(i + 1) % cs.length]!;
          nx += (a.y - b.y) * (a.z + b.z);
          ny += (a.z - b.z) * (a.x + b.x);
          nz += (a.x - b.x) * (a.y + b.y);
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        // normal voltada ao observador (superfícies finas: sem culling)
        const s = nz < 0 ? -1 : 1;
        const lambert = Math.max(
          0,
          nx * s * LIGHT.x + ny * s * LIGHT.y + nz * s * LIGHT.z,
        );
        const facing = Math.abs(nz);
        const shade = 0.18 + 0.72 * Math.pow(lambert, 0.85);
        // realce de silhueta / fresnel suave
        const fres = 0.16 * (1 - facing);
        const depth = cs.reduce((s2, p) => s2 + p.z, 0) / cs.length;
        return {
          d: cs.map((p) => `${(p.x * kk).toFixed(2)},${(-p.y * kk).toFixed(2)}`).join(" "),
          depth,
          shade: Math.min(1, shade + fres),
        };
      })
      .sort((a, b) => a.depth - b.depth);

    const e = model.edges.map(([a, b]) => {
      const pa = cp(a);
      const pb = cp(b);
      return {
        x1: pa.x * kk,
        y1: -pa.y * kk,
        x2: pb.x * kk,
        y2: -pb.y * kk,
        depth: (pa.z + pb.z) / 2,
      };
    });
    return { faces: f, edges: e };
  }, [model, cam, scale, k]);

  const maxDepth = Math.max(1, ...edges.map((e) => Math.abs(e.depth)));

  return (
    <svg
      ref={host}
      viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
      className={cn(
        "touch-none select-none",
        interactive && "cursor-grab active:cursor-grabbing",
        className,
      )}
      role="img"
      aria-label="Modelo sólido tridimensional da peça"
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
      <defs>
        <linearGradient id={`steel-${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="var(--solid-hi)" />
          <stop offset="100%" stopColor="var(--solid-lo)" />
        </linearGradient>
        <radialGradient id={`floor-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="0" cy={VB * 0.3} rx={VB * 0.42} ry={VB * 0.08} fill={`url(#floor-${uid})`} />

      <g>
        {faces.map((f, i) => (
          <polygon
            key={`f${i}`}
            points={f.d}
            fill={`url(#steel-${uid})`}
            fillOpacity={f.shade.toFixed(3)}
            stroke="var(--solid-lo)"
            strokeOpacity="0.35"
            strokeWidth={0.35}
            strokeLinejoin="round"
          />
        ))}
        {edges.map((e, i) => (
          <line
            key={`e${i}`}
            x1={e.x1.toFixed(3)}
            y1={e.y1.toFixed(3)}
            x2={e.x2.toFixed(3)}
            y2={e.y2.toFixed(3)}
            stroke="var(--solid-edge)"
            strokeWidth={0.7}
            strokeOpacity={(0.35 + 0.5 * ((e.depth + maxDepth) / (2 * maxDepth))).toFixed(3)}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
