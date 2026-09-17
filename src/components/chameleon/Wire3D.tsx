/**
 * RENDERER CALDRA — apresentação da geometria paramétrica.
 *
 * Recebe GEOMETRIA (malha + arestas + bounds em mm), nunca parâmetros.
 * Câmera, rotação, zoom e enquadramento vivem aqui; a peça nunca é alterada
 * por interação. Sombreamento por normal real (key + fill + rim), superfície
 * interna com material próprio e espessura visível nas aberturas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/lib/geometry/types";
import { centerOf, fitRadius, type Camera, type WireModel } from "@/lib/viz3d/wire";
import { FACE_MATERIALS, FILL_LIGHT, KEY_LIGHT } from "@/lib/viz3d/shading";
import {
  VISIBILITY_POLICY,
  compareSurfaceDepth,
  projectLine,
  toCameraPoint,
  visibleLineSegments,
  type ProjectedTriangle,
  type VisibilityPolicy,
} from "@/lib/viz3d/visibility";
import {
  entityIndexOf,
  pickEdgeIndex,
  pickFaceIndex,
  refLabel,
} from "@/lib/viz3d/selection";
import type { GeometryRef } from "@/lib/geometry/refs";
import { cameraForView, type EdgeMode, type ViewPresetId } from "@/lib/viz3d/cameraPresets";
import { cn } from "@/lib/utils";

type Props = {
  model: WireModel;
  className?: string;
  interactive?: boolean;
  autoSpin?: boolean;
  /** progresso 0..1 de "abertura" da peça (3D → planificação) */
  unfold?: number;
  /** padrão técnico persistente; oclusão espacial é opt-in */
  lineVisibility?: Extract<VisibilityPolicy, "technical-persistent" | "real-occlusion">;
  /** vista padrão aplicada à câmera (não altera geometria) */
  view?: ViewPresetId;
  /** muda de valor para reenquadrar/reaplicar a vista atual */
  viewNonce?: number;
  /** modo de aresta — apenas apresentação */
  edgeMode?: EdgeMode;
  /**
   * SELEÇÃO (Fase F): resolve o índice de uma aresta/face para a referência
   * canônica de origem. Quando ausente, a peça não é selecionável.
   */
  refForEdge?: ((index: number) => GeometryRef | null) | undefined;
  refForFace?: ((index: number) => GeometryRef | null) | undefined;
  /** Referência destacada (seleção 3D ou foco vindo do 2D/parâmetros). */
  highlightRef?: GeometryRef | null | undefined;
  /** Toque/clique sem arraste sobre entidade mapeável (null = toque no vazio). */
  onSelectRef?: ((ref: GeometryRef | null) => void) | undefined;
};

const VB = 200;

/** Rotação yaw/pitch → espaço de câmera (z cresce em direção ao observador). */
const KEY = KEY_LIGHT;
const FILL = FILL_LIGHT;
const MAT = FACE_MATERIALS;

export function Wire3D({
  model,
  className,
  interactive = false,
  autoSpin = false,
  unfold = 0,
  lineVisibility = "technical-persistent",
  view,
  viewNonce = 0,
  edgeMode = "shaded-edges",
  refForEdge,
  refForFace,
  highlightRef = null,
  onSelectRef,
}: Props) {
  const [cam, setCam] = useState<Camera>(() => (view ? cameraForView(view) : { yaw: 0.7, pitch: 0.4, zoom: 1 }));
  const drag = useRef<{ x: number; y: number } | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const resume = useRef(0);

  /* vista padrão / reenquadramento: só orientação e zoom de fit */
  useEffect(() => {
    if (!view) return;
    setCam(cameraForView(view));
  }, [view, viewNonce]);
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
  const { faces, edges, refs } = useMemo(() => {
    const kk = fit.scale * cam.zoom;
    const cache = new Map<string, Vec3>();
    const cp = (p: Vec3) => {
      const key = `${p.x}|${p.y}|${p.z}`;
      let c = cache.get(key);
      if (!c) {
        c = toCameraPoint(
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

    type Tri = ProjectedTriangle & { d: string; fill: string };
    const f: Tri[] = [];

    model.faces.forEach((face, idx) => {
      const cs = face.pts.map(cp);
      if (cs.length < 3) return;
      // normal real da malha (espaço de modelo), corrigida pela escala de
      // planificação e levada ao espaço de câmera — nunca derivada da tela.
      const mn = face.n ?? { x: 0, y: 1, z: 0 };
      const sy = k > 1e-6 ? 1 / k : 1;
      const nl = Math.hypot(mn.x, mn.y * sy, mn.z) || 1;
      const cn = toCameraPoint({ x: mn.x / nl, y: (mn.y * sy) / nl, z: mn.z / nl }, cam);
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
      const depths = cs.map((point) => point.z + bias);
      const minDepth = Math.min(...depths);
      const maxDepth = Math.max(...depths);
      const centerDepth = depths.reduce((acc, depth) => acc + depth, 0) / depths.length;
      const a = cs[0]!;
      for (let i = 1; i + 1 < cs.length; i++) {
        const b = cs[i]!;
        const c = cs[i + 1]!;
        f.push({
          id: `face:${idx}:${i - 1}`,
          d: [a, b, c].map((p) => `${(p.x * kk).toFixed(2)},${(-p.y * kk).toFixed(2)}`).join(" "),
          pts: [
            { x: a.x * kk, y: -a.y * kk, z: a.z + bias },
            { x: b.x * kk, y: -b.y * kk, z: b.z + bias },
            { x: c.x * kk, y: -c.y * kk, z: c.z + bias },
          ],
          minDepth,
          maxDepth,
          centerDepth,
          priority: idx,
          fill: paint,
        });
      }
    });

    // ordenação estável: empates resolvidos pelo índice, sem cintilação
    f.sort(compareSurfaceDepth);

    const depthEpsilon = span * 1e-5;
    const e = model.edges.flatMap((edge, index) =>
      visibleLineSegments(projectLine(`edge:${index}`, edge, cp, kk), lineVisibility, f, depthEpsilon),
    );
    const r = (model.refLines ?? []).flatMap((edge, index) =>
      visibleLineSegments(projectLine(`reference:${index}`, edge, cp, kk), VISIBILITY_POLICY.reference, f, depthEpsilon),
    );

    return { faces: f, edges: e, refs: r };
  }, [model, cam, fit, k, lineVisibility]);

  const maxDepth = Math.max(1, ...edges.flatMap((e) => [Math.abs(e.z1), Math.abs(e.z2)]));

  /*
   * Destaque de seleção: entidades cuja origem canônica é `highlightRef`.
   * Camada "selection" — acima de superfícies e arestas, nunca substitui as
   * cores técnicas nem depende apenas de cor (rótulo textual acompanha).
   */
  const selectedEdges = useMemo(
    () =>
      highlightRef && refForEdge
        ? edges.filter((e) => refForEdge(entityIndexOf(e.id)) === highlightRef)
        : [],
    [edges, highlightRef, refForEdge],
  );
  const selectedFaces = useMemo(
    () =>
      highlightRef && refForFace
        ? faces.filter((f) => refForFace(f.priority) === highlightRef)
        : [],
    [faces, highlightRef, refForFace],
  );
  const labelAnchor = selectedEdges[0]
    ? { x: (selectedEdges[0].x1 + selectedEdges[0].x2) / 2, y: (selectedEdges[0].y1 + selectedEdges[0].y2) / 2 }
    : selectedFaces[0]
      ? {
          x: (selectedFaces[0].pts[0]!.x + selectedFaces[0].pts[2]!.x) / 2,
          y: (selectedFaces[0].pts[0]!.y + selectedFaces[0].pts[2]!.y) / 2,
        }
      : null;

  const onDragStart = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive && ev.pointerType === "touch") return; // toque continua servindo ao card
    drag.current = { x: ev.clientX, y: ev.clientY };
    downAt.current = { x: ev.clientX, y: ev.clientY };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  /* Toque/clique SEM arraste = seleção; arraste continua sendo rotação. */
  const onTapSelect = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectRef || !downAt.current) return;
    const moved = Math.hypot(ev.clientX - downAt.current.x, ev.clientY - downAt.current.y);
    downAt.current = null;
    if (moved > 8) return;
    const svg = host.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    const faceIdx = refForFace ? pickFaceIndex(faces, pt.x, pt.y) : null;
    if (faceIdx !== null) {
      const ref = refForFace!(faceIdx);
      if (ref) {
        onSelectRef(ref);
        return;
      }
    }
    const edgeIdx = refForEdge ? pickEdgeIndex(edges, pt.x, pt.y, 4) : null;
    const ref = edgeIdx !== null ? refForEdge!(edgeIdx) : null;
    onSelectRef(ref);
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
          pitch: interactive ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, c.pitch + dy * 0.006)) : c.pitch,
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
      <g>
        {edgeMode !== "wireframe" &&
          faces.map((f) => (
            <polygon
              key={f.id}
              data-entity-id={f.id}
              data-category="surface"
              points={f.d}
              fill={f.fill}
              stroke={f.fill}
              strokeWidth={0.3}
              strokeLinejoin="round"
            />
          ))}
        {refs.map((e) => (
          <line
            key={e.id}
            data-entity-id={e.id}
            data-category="reference"
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
        {edgeMode !== "shaded" &&
          edges.map((e) => (
            <line
              key={e.id}
              data-entity-id={e.id}
              data-category="edge"
              x1={e.x1.toFixed(2)}
              y1={e.y1.toFixed(2)}
              x2={e.x2.toFixed(2)}
              y2={e.y2.toFixed(2)}
              stroke="var(--solid-edge)"
              strokeWidth={0.6}
              strokeOpacity={
                edgeMode === "wireframe"
                  ? (0.45 + 0.45 * (((e.z1 + e.z2) / 2 + maxDepth) / (2 * maxDepth))).toFixed(3)
                  : (0.18 + 0.42 * (((e.z1 + e.z2) / 2 + maxDepth) / (2 * maxDepth))).toFixed(3)
              }
              strokeLinecap="round"
            />
          ))}
      </g>

    </svg>
  );
}
