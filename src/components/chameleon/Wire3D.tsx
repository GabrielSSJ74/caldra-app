/**
 * RENDERER CALDRA — apresentação da geometria paramétrica.
 *
 * Recebe GEOMETRIA (malha + arestas + bounds em mm), nunca parâmetros.
 * Câmera, rotação, zoom e enquadramento vivem aqui; a peça nunca é alterada
 * por interação. Sombreamento por normal real (key + fill + rim), superfície
 * interna com material próprio e espessura visível nas aberturas.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/lib/geometry/types";
import { centerOf, fitRadius, type Camera, type WireModel } from "@/lib/viz3d/wire";
import { FACE_MATERIALS, FILL_LIGHT, KEY_LIGHT } from "@/lib/viz3d/shading";
import { cn } from "@/lib/utils";

type Props = {
  model: WireModel;
  className?: string;
  interactive?: boolean;
  autoSpin?: boolean;
  /** progresso 0..1 de "abertura" da peça (3D → planificação) */
  unfold?: number;
  /** sombra de contato: recurso de diagnóstico, desligado no padrão técnico */
  showShadow?: boolean;
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

const KEY = KEY_LIGHT;
const FILL = FILL_LIGHT;
const MAT = FACE_MATERIALS;

export function Wire3D({
  model,
  className,
  interactive = false,
  autoSpin = false,
  unfold = 0,
  showShadow = false,
}: Props) {
  const [cam, setCam] = useState<Camera>({ yaw: 0.7, pitch: 0.4, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const resume = useRef(0);
  const host = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(true);

  /* pausa automática fora da viewport / aba oculta */
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((ents) => setVisible(ents[0]?.isIntersecting ?? true), {
      threshold: 0.05,
    });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && true);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* rotação automática 360° contínua (sem salto ao completar a volta) */
  useEffect(() => {
    if (!autoSpin || !visible) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (!drag.current && t > resume.current)
        setCam((c) => ({ ...c, yaw: (c.yaw + dt * 0.32) % (Math.PI * 2) }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoSpin, visible]);

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

  /* enquadramento automático a partir do bounding box real (mm) */
  const fit = useMemo(() => {
    const c = centerOf(model.bounds);
    return { center: c, scale: (VB * 0.4) / fitRadius(model.bounds) };
  }, [model]);

  const k = 1 - unfold * 0.9;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const { faces, edges, refs, ground } = useMemo(() => {
    const kk = fit.scale * cam.zoom;
    const cache = new Map<string, Vec3>();
    const cp = (p: Vec3) => {
      const key = `${p.x}|${p.y}|${p.z}`;
      let c = cache.get(key);
      if (!c) {
        c = toCam(
          { x: p.x - fit.center.x, y: (p.y - fit.center.y) * k, z: p.z - fit.center.z },
          cam,
        );
        cache.set(key, c);
      }
      return c;
    };

    // "polygon offset": prioridade de profundidade por tipo de face, sem
    // mexer em nenhum vértice — apenas política de desenho.
    const BIAS: Record<string, number> = { inner: -0.6, cap: -0.3, rim: 0.3, outer: 0 };
    const span = Math.max(1e-6, fitRadius(model.bounds));

    type Tri = { d: string; depth: number; idx: number; fill: string };
    const f: Tri[] = [];

    model.faces.forEach((face, idx) => {
      const cs = face.pts.map(cp);
      if (cs.length < 3) return;
      // normal real da malha (espaço de modelo), corrigida pela escala de
      // planificação e levada ao espaço de câmera — nunca derivada da tela.
      const mn = face.n ?? { x: 0, y: 1, z: 0 };
      const sy = k > 1e-6 ? 1 / k : 1;
      const nl = Math.hypot(mn.x, mn.y * sy, mn.z) || 1;
      const cn = toCam({ x: mn.x / nl, y: (mn.y * sy) / nl, z: mn.z / nl }, cam);
      const nx = cn.x;
      const ny = cn.y;
      const nz = cn.z;
      // Visibilidade da superfície interna: regra geométrica determinística.
      // A parede interna só é observável quando sua normal (que aponta para
      // dentro da peça) está voltada ao observador — isto é, a parede do lado
      // oposto, vista através da boca aberta. A parede interna próxima fica
      // atrás da superfície externa e não é desenhada.
      if (face.kind === "inner" && nz <= 0) return;
      // dupla face: a superfície interna é iluminada pela normal invertida
      const s = nz < 0 ? -1 : 1;
      const key = Math.max(0, nx * s * KEY.x + ny * s * KEY.y + nz * s * KEY.z);
      const fill = Math.max(0, nx * s * FILL.x + ny * s * FILL.y + nz * s * FILL.z);
      const rim = Math.pow(1 - Math.abs(nz), 3);
      const m = MAT[face.kind] ?? MAT["outer"]!;
      // difuso + preenchimento + reflexo especular discreto (metal semiacetinado)
      const spec = Math.pow(key, 14) * 0.3;
      const lum = m.amb + m.gain * (0.82 * Math.pow(key, 0.85) + 0.22 * fill) + spec + 0.12 * rim;
      const pct = Math.max(0, Math.min(100, lum * 100));
      const paint = `color-mix(in oklab, ${m.hi} ${pct.toFixed(1)}%, ${m.base})`;
      // desempate por GRUPO de casca: em corpos que se cruzam (tubo × ramal),
      // o ramal é sempre o corpo externo na junção — vence empates de
      // profundidade sem mover nenhum vértice.
      const bias = ((BIAS[face.kind] ?? 0) + (face.g ?? 0) * 0.75) * span * 0.002;

      // Triangulação determinística em leque, apenas na representação: nenhum
      // ponto é movido. A PROFUNDIDADE continua sendo a da face inteira, para
      // que os triângulos de um mesmo polígono nunca se intercalem com os de
      // polígonos vizinhos (origem de listras e do efeito fantasma).
      const depth = cs.reduce((acc, p) => acc + p.z, 0) / cs.length + bias;
      const a = cs[0]!;
      for (let i = 1; i + 1 < cs.length; i++) {
        const b = cs[i]!;
        const c = cs[i + 1]!;
        f.push({
          d: [a, b, c].map((p) => `${(p.x * kk).toFixed(2)},${(-p.y * kk).toFixed(2)}`).join(" "),
          depth,
          idx,
          fill: paint,
        });
      }
    });

    // ordenação estável: empates resolvidos pelo índice, sem cintilação
    f.sort((x, y) => x.depth - y.depth || x.idx - y.idx);

    const line = (a: Vec3, b: Vec3) => {
      const pa = cp(a);
      const pb = cp(b);
      return {
        x1: pa.x * kk,
        y1: -pa.y * kk,
        x2: pb.x * kk,
        y2: -pb.y * kk,
        depth: (pa.z + pb.z) / 2,
      };
    };

    // remoção aproximada de linhas ocultas: apenas arestas do hemisfério frontal
    const e = model.edges.map(([a, b]) => line(a, b)).filter((l) => l.depth > 0);
    // linhas técnicas seguem o MESMO critério de profundidade das arestas:
    // não são mais desenhadas por cima da peça inteira.
    const r = (model.refLines ?? []).map(([a, b]) => line(a, b)).filter((l) => l.depth > 0);

    const radius = fitRadius(model.bounds);
    const rx = radius * kk * 0.92;
    // piso/sombra levemente ABAIXO da base: sem disputa de profundidade com a
    // peça e sem afastamento perceptível (a peça não é movida).
    const floorDrop = radius * 0.006;
    const gy =
      ((model.bounds.min.y - fit.center.y) * k - floorDrop) * Math.cos(cam.pitch) * kk;
    return { faces: f, edges: e, refs: r, ground: { rx, y: -gy } };
  }, [model, cam, fit, k]);

  const maxDepth = Math.max(1, ...edges.map((e) => Math.abs(e.depth)));

  const onDragStart = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive && ev.pointerType === "touch") return; // toque continua servindo ao card
    drag.current = { x: ev.clientX, y: ev.clientY };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  return (
    <svg
      ref={host}
      viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
      className={cn(
        "select-none",
        interactive ? "touch-none cursor-grab active:cursor-grabbing" : "touch-auto",
        className,
      )}
      role="img"
      aria-label="Modelo tridimensional paramétrico da peça"
      onPointerDown={onDragStart}
      onPointerMove={(ev) => {
        if (!drag.current) return;
        const dx = ev.clientX - drag.current.x;
        const dy = ev.clientY - drag.current.y;
        drag.current = { x: ev.clientX, y: ev.clientY };
        setCam((c) => ({
          ...c,
          yaw: c.yaw + dx * 0.008,
          pitch: interactive ? Math.max(-1.3, Math.min(1.3, c.pitch + dy * 0.006)) : c.pitch,
        }));
      }}
      onPointerUp={() => {
        drag.current = null;
        resume.current = performance.now() + 900;
      }}
      onPointerLeave={() => {
        drag.current = null;
        resume.current = performance.now() + 900;
      }}
    >
      <defs>
        <radialGradient id={`floor-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--solid-edge)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--solid-edge)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra de contato: apenas diagnóstico, nunca padrão técnico */}
      {showShadow ? (
        <ellipse
          cx="0"
          cy={ground.y.toFixed(2)}
          rx={Math.max(4, ground.rx).toFixed(2)}
          ry={Math.max(2, ground.rx * 0.2).toFixed(2)}
          fill={`url(#floor-${uid})`}
        />
      ) : null}

      <g>
        {faces.map((f, i) => (
          <polygon
            key={`f${i}`}
            points={f.d}
            fill={f.fill}
            stroke={f.fill}
            strokeWidth={0.3}
            strokeLinejoin="round"
          />
        ))}
        {refs.map((e, i) => (
          <line
            key={`r${i}`}
            x1={e.x1.toFixed(2)}
            y1={e.y1.toFixed(2)}
            x2={e.x2.toFixed(2)}
            y2={e.y2.toFixed(2)}
            stroke="var(--solid-edge)"
            strokeWidth={0.5}
            strokeOpacity={0.45}
            strokeDasharray="4 3 1 3"
          />
        ))}
        {edges.map((e, i) => (
          <line
            key={`e${i}`}
            x1={e.x1.toFixed(2)}
            y1={e.y1.toFixed(2)}
            x2={e.x2.toFixed(2)}
            y2={e.y2.toFixed(2)}
            stroke="var(--solid-edge)"
            strokeWidth={0.6}
            strokeOpacity={(0.18 + 0.42 * ((e.depth + maxDepth) / (2 * maxDepth))).toFixed(3)}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
