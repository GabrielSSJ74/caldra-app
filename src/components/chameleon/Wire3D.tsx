/**
 * RENDERER CALDRA — apresentação da geometria paramétrica + adaptador B-Rep CHAMFER CAD 3D.
 *
 * Recebe GEOMETRIA (malha + arestas + bounds em mm), nunca parâmetros.
 * Câmera, rotação, zoom e enquadramento vivem aqui; a peça nunca é alterada
 * por interação.
 *
 * Modos de visualização:
 * - SOMB ("shaded"): 100% preservado (intacto).
 * - SOMB+AR ("shaded-edges"): Superfície sombreada + arestas técnicas B-Rep sem triangulação.
 * - ARAME ("wireframe"): Arame Técnico B-Rep invariante em espaço de tela com casca fantasma X-Ray e arestas ocultas atenuadas.
 * - SOLID ("solid"): Sólido volumétrico metálico CHAMFER 3D com espessura física e iluminação de estúdio de 3 pontos.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeometryRef } from "@/lib/geometry/refs";
import type { Vec3 } from "@/lib/geometry/types";
import { cn } from "@/lib/utils";
import { cameraForView, type EdgeMode, type ViewPresetId } from "@/lib/viz3d/cameraPresets";
import { entityIndexOf, pickEdgeIndex, pickFaceIndex, refLabel } from "@/lib/viz3d/selection";
import { FACE_MATERIALS } from "@/lib/viz3d/shading";
import { TECHNICAL_LIGHTING } from "@/lib/viz3d/technicalConfig";
import {
  compareSurfaceDepth,
  deduplicateEdges,
  filterEdgesForMode,
  type ProjectedLine,
  type ProjectedTriangle,
  projectLine,
  toCameraPoint,
  VISIBILITY_POLICY,
  type VisibilityPolicy,
  visibleLineSegments,
} from "@/lib/viz3d/visibility";
import { type Camera, centerOf, type EntityKind, fitRadius, type WireModel } from "@/lib/viz3d/wire";

type Props = {
  model: WireModel;
  className?: string;
  interactive?: boolean;
  autoSpin?: boolean;
  /** Modo de arraste primário: 'orbit' (rotação 3D) ou 'pan' (translação espacial) */
  mode?: "orbit" | "pan";
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
  /** Linhas de referência (eixos pontilhados de centro/geratriz). Default: true, exceto quando edgeMode === 'shaded'. */
  showRefLines?: boolean;
  /**
   * SELEÇÃO (Fase F): resolve o índice de uma aresta/face para a referência
   * canônica de origem. Quando ausente, a peça não é selecionável.
   */
  refForEdge?: ((index: number) => GeometryRef | null) | undefined;
  refForFace?: ((index: number) => GeometryRef | null) | undefined;
  /** Referência(s) destacada(s) (seleção 3D ou foco vindo do 2D/parâmetros). */
  highlightRef?: GeometryRef | readonly GeometryRef[] | null | undefined;
  /** Toque/clique sem arraste sobre entidade mapeável (null = toque no vazio). */
  onSelectRef?: ((ref: GeometryRef | null) => void) | undefined;
};

const VB = 200;

/** Iluminação técnica uniforme baseada na normal física real */
const KEY = TECHNICAL_LIGHTING.keyLight;
const FILL = TECHNICAL_LIGHTING.fillLight;
const MAT = FACE_MATERIALS;

export function Wire3D({
  model,
  className,
  interactive = false,
  autoSpin = false,
  mode = "orbit",
  unfold = 0,
  lineVisibility,
  view,
  viewNonce = 0,
  edgeMode = "shaded-edges",
  showRefLines,
  refForEdge,
  refForFace,
  highlightRef = null,
  onSelectRef,
}: Props) {
  const [cam, setCam] = useState<Camera>(() =>
    view ? cameraForView(view) : { yaw: 0.7, pitch: 0.4, zoom: 1, panX: 0, panY: 0 },
  );
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragMode = useRef<"orbit" | "pan">("orbit");
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const velocity = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const inertiaRaf = useRef<number>(0);
  const resume = useRef(0);

  /* vista padrão / reenquadramento: só orientação e zoom de fit */
  useEffect(() => {
    if (view) {
      setCam(cameraForView(view));
    } else if (viewNonce > 0) {
      setCam({ yaw: 0.7, pitch: 0.4, zoom: 1, panX: 0, panY: 0 });
    }
  }, [view, viewNonce]);

  useEffect(() => {
    return () => {
      if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    };
  }, []);

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
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
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
      setCam((c) => ({
        ...c,
        zoom: Math.min(4.5, Math.max(0.35, c.zoom * Math.exp(-dy * 0.0015))),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive]);

  /* enquadramento automático a partir do bounding box real (mm) */
  const fit = useMemo(() => {
    if (!model || !model.bounds) {
      return { center: { x: 0, y: 0, z: 0 }, scale: 1 };
    }
    const c = centerOf(model.bounds);
    const r = fitRadius(model.bounds);
    return { center: c, scale: (VB * 0.4) / (r > 1e-6 ? r : 1) };
  }, [model]);

  const k = 1 - unfold * 0.9;
  const { faces, edges, hiddenWireEdges, refs } = useMemo(() => {
    if (!model || !model.faces || !model.bounds) {
      return { faces: [], edges: [], hiddenWireEdges: [], refs: [] };
    }
    const kk = fit.scale * cam.zoom;
    const panX = cam.panX ?? 0;
    const panY = cam.panY ?? 0;
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

    type Tri = ProjectedTriangle & { d: string; fill: string; solidFill: string };
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
      // Visibilidade determinística das superfícies:
      if (face.kind === "inner" && nz <= 0) return;
      if (face.kind === "outer" && unfold < 0.05 && nz < -0.03) return;
      if (face.kind === "rim" && unfold < 0.05 && mn.y < -0.5 && cam.pitch > 0.05) return;
      const s = unfold >= 0.05 && nz < 0 ? -1 : 1;
      const key = Math.max(0, nx * s * KEY.x + ny * s * KEY.y + nz * s * KEY.z);
      const fill = Math.max(0, nx * s * FILL.x + ny * s * FILL.y + nz * s * FILL.z);
      const rim = Math.pow(1 - Math.abs(nz), 3);
      const m = MAT[face.kind] ?? MAT["outer"]!;
      // Gradiente radial discreto simulando fonte de luz superior-esquerda (-0.42, +0.48)
      const cxCam = cs.reduce((acc, p) => acc + p.x, 0) / (cs.length * span);
      const cyCam = cs.reduce((acc, p) => acc + p.y, 0) / (cs.length * span);
      const distTopLeft = Math.hypot(cxCam + 0.42, cyCam - 0.48);
      const radialBoost = Math.max(0, 1 - distTopLeft * 0.68) * 0.16;
      // difuso + preenchimento + reflexo especular discreto + luz radial superior-esquerda
      const spec = Math.pow(key, 14) * 0.22;
      const lum =
        m.amb +
        m.gain * (0.8 * Math.pow(key, 0.85) + 0.24 * fill) +
        spec +
        0.1 * rim +
        radialBoost;
      const pct = Math.max(4, Math.min(96, lum * 100));
      // Paint original (100% preservado para SOMB e SOMB+AR)
      const paint = `color-mix(in oklab, ${m.hi} ${pct.toFixed(1)}%, ${m.base})`;

      // Shading metálico de estúdio 3-pontos CHAMFER 3D para o novo modo SOLID
      const envHemisphere = 0.5 + 0.5 * (ny * s);
      const studioSpec = Math.pow(key, 20) * 0.36 + Math.pow(Math.max(0, nz * s), 12) * 0.14;
      const studioRim = Math.pow(1 - Math.abs(nz), 2.4) * 0.22;
      const solidLum =
        face.kind === "inner"
          ? 0.12 + 0.52 * (0.65 * key + 0.35 * fill)
          : face.kind === "rim"
            ? 0.78 + 0.2 * key
            : 0.18 +
              0.68 * (0.72 * Math.pow(key, 0.9) + 0.28 * fill) +
              0.12 * envHemisphere +
              studioSpec +
              studioRim +
              radialBoost * 0.85;
      const solidPct = Math.max(6, Math.min(98, solidLum * 100));
      const solidBase =
        face.kind === "inner" ? "#071324" : face.kind === "rim" ? "#38BDF8" : "#0F2942";
      const solidHi =
        face.kind === "inner" ? "#1E3A5F" : face.kind === "rim" ? "#E0F2FE" : "#BAE6FD";
      const solidPaint = `color-mix(in oklab, ${solidHi} ${solidPct.toFixed(1)}%, ${solidBase})`;

      const bias = ((BIAS[face.kind] ?? 0) + (face.g ?? 0) * 0.75) * span * 0.002;

      const depths = cs.map((point) => point.z + bias);
      const minDepth = Math.min(...depths);
      const maxDepth = Math.max(...depths);
      const centerDepth = depths.reduce((acc, depth) => acc + depth, 0) / depths.length;
      const a = cs[0]!;
      const passIndex = face.kind === "inner" ? 0 : face.kind === "cap" ? 1 : 2;

      for (let i = 1; i + 1 < cs.length; i++) {
        const b = cs[i]!;
        const c = cs[i + 1]!;
        const pA = { x: a.x * kk + panX, y: -a.y * kk + panY, z: a.z };
        const pB = { x: b.x * kk + panX, y: -b.y * kk + panY, z: b.z };
        const pC = { x: c.x * kk + panX, y: -c.y * kk + panY, z: c.z };
        const xs = [pA.x, pB.x, pC.x];
        const ys = [pA.y, pB.y, pC.y];
        f.push({
          id: `face:${idx}:${i - 1}`,
          d: [a, b, c]
            .map((p) => `${(p.x * kk + panX).toFixed(2)},${(-p.y * kk + panY).toFixed(2)}`)
            .join(" "),
          pts: [pA, pB, pC],
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          minDepth,
          maxDepth,
          centerDepth,
          priority: idx,
          pass: passIndex,
          kind: face.kind,
          fill: paint,
          solidFill: solidPaint,
        });
      }
    });

    // ordenação estável: empates resolvidos pelo índice, sem cintilação
    f.sort(compareSurfaceDepth);

    // 1. Filtragem global por modo de visualização 3D:
    const filtered = filterEdgesForMode(model.edges, model.edgeKinds, model.edgeTags, edgeMode);

    // 2. Deduplicação na camada de apresentação:
    const deduped = deduplicateEdges(
      filtered.edges,
      filtered.kinds,
      filtered.tags,
      filtered.originalIndices,
      span * 1e-4,
    );

    // 3. Oclusão de profundidade e projeção:
    const effectiveVisibility =
      lineVisibility ??
      (edgeMode === "shaded-edges" || edgeMode === "solid"
        ? "real-occlusion"
        : "technical-persistent");

    // Apenas faces externas atuam como oclusores para as linhas (sem auto-oclusão das bordas rim)
    const occluders = f.filter(
      (tri) => tri.kind === "outer" && tri.pts[0] && tri.pts[1] && tri.pts[2],
    );

    const depthEpsilon = span * 3.5e-3;
    type StyledEdge = ProjectedLine & { kind?: EntityKind | undefined };

    let e: StyledEdge[] = [];
    let hiddenWire: StyledEdge[] = [];

    if (edgeMode === "shaded") {
      // MODO SOMB: 100% IDÊNTICO AO ORIGINAL
      e = model.edges.flatMap((edge, index) => {
        const kind = model.edgeKinds?.[index];
        if (kind !== "REAL_BOUNDARY") return [];
        return visibleLineSegments(
          projectLine(`edge:${index}`, edge, cp, kk, panX, panY),
          "real-occlusion",
          occluders,
          depthEpsilon,
        );
      });
    } else if (edgeMode === "wireframe") {
      // MODO ARAME TÉCNICO B-REP CHAMFER 3D:
      // 1) Passada de fundo (GreaterDepth / arestas traseiras ocultas com opacidade 0.25)
      hiddenWire = deduped.edges.map((edge, index) => {
        const origIndex = deduped.originalIndices[index] ?? index;
        const kind = deduped.kinds[index] ?? "REAL_EDGE";
        return {
          ...projectLine(`hidden:${origIndex}`, edge, cp, kk, panX, panY),
          kind,
        };
      });
      // 2) Passada frontal (LessEqualDepth / arestas frontais visíveis com hierarquia B-Rep)
      e = deduped.edges.flatMap((edge, index) => {
        const origIndex = deduped.originalIndices[index] ?? index;
        const kind = deduped.kinds[index] ?? "REAL_EDGE";
        return visibleLineSegments(
          projectLine(`edge:${origIndex}`, edge, cp, kk, panX, panY),
          "real-occlusion",
          occluders,
          depthEpsilon,
        ).map((seg) => ({ ...seg, kind }));
      });
    } else {
      // MODO SOMB+AR ("shaded-edges") e MODO SOLID ("solid"):
      e = deduped.edges.flatMap((edge, index) => {
        const origIndex = deduped.originalIndices[index] ?? index;
        const kind = deduped.kinds[index] ?? "REAL_EDGE";
        return visibleLineSegments(
          projectLine(`edge:${origIndex}`, edge, cp, kk, panX, panY),
          effectiveVisibility,
          occluders,
          depthEpsilon,
        ).map((seg) => ({ ...seg, kind }));
      });
    }

    const shouldShowRefs = showRefLines ?? (edgeMode !== "shaded" && edgeMode !== "solid");
    const r = shouldShowRefs
      ? (model.refLines ?? []).flatMap((edge, index) =>
          visibleLineSegments(
            projectLine(`reference:${index}`, edge, cp, kk, panX, panY),
            VISIBILITY_POLICY.reference,
            occluders,
            depthEpsilon,
          ),
        )
      : [];

    return { faces: f, edges: e, hiddenWireEdges: hiddenWire, refs: r };
  }, [model, cam, fit, k, lineVisibility, edgeMode, showRefLines]);

  const maxDepth = Math.max(1, ...edges.flatMap((e) => [Math.abs(e.z1), Math.abs(e.z2)]));

  const highlightRefs = useMemo<readonly GeometryRef[]>(
    () => (highlightRef == null ? [] : Array.isArray(highlightRef) ? highlightRef : [highlightRef]),
    [highlightRef],
  );
  const hasHighlight = highlightRefs.length > 0;
  const selectedEdges = useMemo(
    () =>
      hasHighlight && refForEdge
        ? edges.filter((e) => {
            const r = refForEdge(entityIndexOf(e.id));
            return r != null && highlightRefs.includes(r);
          })
        : [],
    [edges, hasHighlight, highlightRefs, refForEdge],
  );
  const selectedFaces = useMemo(
    () =>
      hasHighlight && refForFace
        ? faces.filter((f) => {
            const r = refForFace(f.priority);
            return r != null && highlightRefs.includes(r);
          })
        : [],
    [faces, hasHighlight, highlightRefs, refForFace],
  );
  const labelAnchor = selectedEdges[0]
    ? {
        x: (selectedEdges[0].x1 + selectedEdges[0].x2) / 2,
        y: (selectedEdges[0].y1 + selectedEdges[0].y2) / 2,
      }
    : selectedFaces[0]?.pts && selectedFaces[0].pts.length >= 3
      ? {
          x: ((selectedFaces[0].pts[0]?.x ?? 0) + (selectedFaces[0].pts[2]?.x ?? 0)) / 2,
          y: ((selectedFaces[0].pts[0]?.y ?? 0) + (selectedFaces[0].pts[2]?.y ?? 0)) / 2,
        }
      : null;

  const startInertia = () => {
    if (!interactive || dragMode.current !== "orbit") return;
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    const step = () => {
      if (drag.current) return;
      velocity.current.vx *= 0.92;
      velocity.current.vy *= 0.92;
      const speed = Math.hypot(velocity.current.vx, velocity.current.vy);
      if (speed < 0.0004) {
        velocity.current = { vx: 0, vy: 0 };
        return;
      }
      setCam((c) => ({
        ...c,
        yaw: c.yaw + velocity.current.vx,
        pitch: c.pitch + velocity.current.vy,
      }));
      resume.current = performance.now() + 600;
      inertiaRaf.current = requestAnimationFrame(step);
    };
    if (Math.hypot(velocity.current.vx, velocity.current.vy) > 0.001) {
      inertiaRaf.current = requestAnimationFrame(step);
    }
  };

  const onDragStart = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive && ev.pointerType === "touch") return; // toque continua servindo ao card
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    velocity.current = { vx: 0, vy: 0 };
    const isPan =
      ev.button === 1 || ev.button === 2 || ev.shiftKey || ev.ctrlKey || mode === "pan";
    dragMode.current = isPan ? "pan" : "orbit";
    drag.current = { x: ev.clientX, y: ev.clientY };
    downAt.current = { x: ev.clientX, y: ev.clientY };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  /* Toque/clique SEM arraste = seleção; arraste continua sendo rotação ou pan. */
  const onTapSelect = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectRef || !downAt.current) return;
    const moved = Math.hypot(ev.clientX - downAt.current.x, ev.clientY - downAt.current.y);
    downAt.current = null;
    if (moved > 8) return;
    const svg = host.current;
    if (!svg) return;
    try {
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
    } catch {
      // ignore
    }
  };

  return (
    <svg
      ref={host}
      viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
      data-edge-mode={edgeMode}
      className={cn(
        "select-none",
        interactive
          ? mode === "pan"
            ? "touch-none cursor-move"
            : "touch-none cursor-grab active:cursor-grabbing"
          : "touch-auto",
        className,
      )}
      role="img"
      aria-label="Modelo tridimensional paramétrico da peça"
      onContextMenu={(ev) => {
        if (interactive) ev.preventDefault();
      }}
      onDoubleClick={() => {
        if (!interactive) return;
        setCam((c) => ({ ...c, panX: 0, panY: 0, zoom: 1 }));
      }}
      onPointerDown={onDragStart}
      onPointerMove={(ev) => {
        if (!drag.current) return;
        const dx = ev.clientX - drag.current.x;
        const dy = ev.clientY - drag.current.y;
        drag.current = { x: ev.clientX, y: ev.clientY };

        if (dragMode.current === "pan") {
          const svg = host.current;
          const rect = svg?.getBoundingClientRect();
          const factor = rect && rect.width > 0 ? VB / rect.width : 1;
          setCam((c) => ({
            ...c,
            panX: (c.panX ?? 0) + dx * factor,
            panY: (c.panY ?? 0) + dy * factor,
          }));
        } else {
          const vyaw = dx * 0.0085;
          const vpitch = interactive ? dy * 0.007 : 0;
          velocity.current = {
            vx: velocity.current.vx * 0.35 + vyaw * 0.65,
            vy: velocity.current.vy * 0.35 + vpitch * 0.65,
          };
          setCam((c) => ({
            ...c,
            yaw: c.yaw + vyaw,
            pitch: interactive ? c.pitch + vpitch : c.pitch,
          }));
        }
      }}
      onPointerUp={(ev) => {
        drag.current = null;
        resume.current = performance.now() + 900;
        startInertia();
        onTapSelect(ev);
      }}
      onPointerLeave={() => {
        if (drag.current) {
          drag.current = null;
          resume.current = performance.now() + 900;
          startInertia();
        }
      }}
    >
      <defs>
        <linearGradient id="genesis-wire3d-crystal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#345B87" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#2B4C73" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g>
        {/* MODO ARAME — Paredes Laterais de Espessura em Azul-Aço Petróleo Acetinado (#2B4C73 / #345B87, opacity: 0.22) */}
        {edgeMode === "wireframe" && (
          <g data-layer="xray-ghost-shell">
            {faces
              .filter((f) => f.kind === "outer" || f.kind === "rim")
              .map((f) => (
                <polygon
                  key={`xray:${f.id}`}
                  points={f.d}
                  fill="url(#genesis-wire3d-crystal-grad)"
                  stroke="none"
                />
              ))}
          </g>
        )}

        {/* SUPERFÍCIES SOMBREADAS (SOMB intacto, SOMB+AR e novo SOLID metálico) */}
        {edgeMode !== "wireframe" &&
          faces.map((f) => {
            const isSolid = edgeMode === "solid";
            const faceFill =
              f.kind === "rim" && edgeMode === "shaded"
                ? "#F8FAFC"
                : isSolid
                  ? f.solidFill
                  : f.fill;
            return (
              <polygon
                key={f.id}
                data-entity-id={f.id}
                data-category="surface"
                points={f.d}
                fill={faceFill}
                stroke={faceFill}
                strokeWidth={f.kind === "rim" && edgeMode === "shaded" ? 0.75 : isSolid ? 0.55 : 0.4}
                strokeLinejoin="round"
              />
            );
          })}

        {/* LINHAS DE REFERÊNCIA (Eixos de Centro) */}
        {(showRefLines ?? (edgeMode !== "shaded" && edgeMode !== "solid")) &&
          refs.map((e) => (
            <line
              key={e.id}
              data-entity-id={e.id}
              data-category="reference"
              x1={e.x1.toFixed(2)}
              y1={e.y1.toFixed(2)}
              x2={e.x2.toFixed(2)}
              y2={e.y2.toFixed(2)}
              stroke={edgeMode === "wireframe" ? "#60A5FA" : "var(--solid-edge)"}
              strokeWidth={edgeMode === "wireframe" ? 0.75 : 0.45}
              vectorEffect={edgeMode === "wireframe" ? "non-scaling-stroke" : undefined}
              strokeOpacity={edgeMode === "wireframe" ? 0.35 : 0.28}
            />
          ))}

        {/* MODO ARAME — Arestas da Base e Arestas Traseiras / Ocultas (Contínua fina 0.95px em Azul-Aço Técnico #60A5FA @ 0.45) */}
        {edgeMode === "wireframe" && (
          <g data-layer="wireframe-hidden-edges">
            {hiddenWireEdges.map((e) => (
              <line
                key={e.id}
                x1={e.x1.toFixed(2)}
                y1={e.y1.toFixed(2)}
                x2={e.x2.toFixed(2)}
                y2={e.y2.toFixed(2)}
                stroke="#60A5FA"
                strokeWidth={0.95}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={0.45}
                strokeLinecap="round"
              />
            ))}
          </g>
        )}

        {/* ARESTAS VISÍVEIS (SOMB intacto, SOMB+AR B-Rep, ARAME Técnico e SOLID chanfros sutis) */}
        {(() => {
          let minY = Infinity;
          let maxY = -Infinity;
          if (edgeMode === "wireframe") {
            for (const e of edges) {
              if (e.y1 < minY) minY = e.y1;
              if (e.y2 < minY) minY = e.y2;
              if (e.y1 > maxY) maxY = e.y1;
              if (e.y2 > maxY) maxY = e.y2;
            }
          }
          const spanY = Math.max(1, maxY - minY);

          return edges.map((e) => {
            if (edgeMode === "shaded") {
              // MODO SOMB: 100% IDÊNTICO AO ORIGINAL
              return (
                <line
                  key={e.id}
                  data-entity-id={e.id}
                  data-category="edge"
                  x1={e.x1.toFixed(2)}
                  y1={e.y1.toFixed(2)}
                  x2={e.x2.toFixed(2)}
                  y2={e.y2.toFixed(2)}
                  stroke="#F8FAFC"
                  strokeWidth={0.95}
                  strokeOpacity={0.92}
                  strokeLinecap="round"
                />
              );
            }

            const isPrimaryBRep =
              e.kind === "REAL_BOUNDARY" ||
              e.kind === "JOINT" ||
              e.kind === "BEND_EDGE" ||
              e.kind === "INTERSECTION";

            if (edgeMode === "solid") {
              return (
                <line
                  key={e.id}
                  data-entity-id={e.id}
                  data-category="edge"
                  x1={e.x1.toFixed(2)}
                  y1={e.y1.toFixed(2)}
                  x2={e.x2.toFixed(2)}
                  y2={e.y2.toFixed(2)}
                  stroke={e.kind === "REAL_BOUNDARY" ? "#E0F2FE" : "#7DD3FC"}
                  strokeWidth={e.kind === "REAL_BOUNDARY" ? 1.25 : 0.95}
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={e.kind === "REAL_BOUNDARY" ? 0.55 : 0.36}
                  strokeLinecap="round"
                />
              );
            }

            if (edgeMode === "wireframe") {
              const midY = (e.y1 + e.y2) * 0.5;
              const tHeight = Math.max(0, Math.min(1, 1 - (midY - minY) / spanY));
              const isTopEdge = tHeight >= 0.72 && isPrimaryBRep;
              const strokeCol = isTopEdge
                ? "#E2E8F0"
                : tHeight >= 0.25
                  ? "#93C5FD"
                  : "#60A5FA";
              const strokeOp = isTopEdge
                ? 0.88
                : tHeight >= 0.25
                  ? 0.72
                  : 0.45;
              return (
                <line
                  key={e.id}
                  data-entity-id={e.id}
                  data-category="edge"
                  data-brep-kind={e.kind ?? "REAL_EDGE"}
                  x1={e.x1.toFixed(2)}
                  y1={e.y1.toFixed(2)}
                  x2={e.x2.toFixed(2)}
                  y2={e.y2.toFixed(2)}
                  stroke={strokeCol}
                  strokeWidth={isTopEdge ? 1.1 : 0.95}
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={strokeOp.toFixed(2)}
                  strokeLinecap="round"
                />
              );
            }

            // Modo SOMB+AR ("shaded-edges") — superfície sombreada + arestas técnicas B-Rep
            const depthFactor = ((e.z1 + e.z2) / 2 + maxDepth) / (2 * maxDepth);
            return (
              <line
                key={e.id}
                data-entity-id={e.id}
                data-category="edge"
                data-brep-kind={e.kind ?? "REAL_EDGE"}
                x1={e.x1.toFixed(2)}
                y1={e.y1.toFixed(2)}
                x2={e.x2.toFixed(2)}
                y2={e.y2.toFixed(2)}
                stroke={
                  e.kind === "REAL_BOUNDARY" || e.kind === "INTERSECTION"
                    ? "#E0F2FE"
                    : e.kind === "JOINT" || e.kind === "BEND_EDGE"
                      ? "#7DD3FC"
                      : "#38BDF8"
                }
                strokeWidth={isPrimaryBRep ? 1.55 : 1.0}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={(isPrimaryBRep ? 0.92 : 0.64 + 0.24 * depthFactor).toFixed(3)}
                strokeLinecap="round"
              />
            );
          });
        })()}

        {hasHighlight && (selectedEdges.length > 0 || selectedFaces.length > 0) && (
          <g data-category="selection" pointerEvents="none">
            {selectedFaces.map((f) => (
              <polygon
                key={`sel:${f.id}`}
                data-entity-id={f.id}
                data-category="selection"
                points={f.d}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={0.9}
                strokeLinejoin="round"
              />
            ))}
            {selectedEdges.map((e) => (
              <line
                key={`sel:${e.id}`}
                data-entity-id={e.id}
                data-category="selection"
                x1={e.x1.toFixed(2)}
                y1={e.y1.toFixed(2)}
                x2={e.x2.toFixed(2)}
                y2={e.y2.toFixed(2)}
                stroke="var(--accent)"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            ))}
            {labelAnchor && (
              <text
                data-category="selection"
                x={labelAnchor.x.toFixed(2)}
                y={(labelAnchor.y - 3).toFixed(2)}
                textAnchor="middle"
                fontSize={7}
                fontFamily="var(--font-mono, monospace)"
                fill="var(--accent)"
                stroke="var(--background)"
                strokeWidth={2.2}
                paintOrder="stroke"
              >
                {highlightRefs.length === 1
                  ? highlightRefs[0]
                    ? refLabel(highlightRefs[0])
                    : ""
                  : `${highlightRefs.length} entidades · ${highlightRefs[0] ? refLabel(highlightRefs[0]) : ""}`}
              </text>
            )}
          </g>
        )}
      </g>
    </svg>
  );
}
