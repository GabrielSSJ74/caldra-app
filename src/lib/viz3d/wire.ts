/**
 * MOTOR 3D PARAMÉTRICO DA TRAÇAGEM.
 *
 * PARÂMETROS → VALIDAÇÃO → MODELO PARAMÉTRICO → GEOMETRIA (malha + arestas)
 *
 * A matemática é a fonte de verdade: os parâmetros vêm dos mesmos valores
 * usados por cálculos, cotas, vista superior e planificação (ver
 * `src/lib/geometry/engines.ts`, que produz `WireParams` a partir das medidas
 * reais da peça). Aqui não existe cálculo paralelo "só para o visual": a
 * geometria 3D é derivada dos mesmos números, em milímetros de mundo.
 */

import { branchAxisLength } from "@/lib/geometry/branch";
import { elbowModel } from "@/lib/geometry/elbowSegments";
import { buildModel as buildSquareToRoundModel } from "@/lib/geometry/squareToRound";
import type { Vec2, Vec3 } from "@/lib/geometry/types";

export type Edge = [Vec3, Vec3];
export type FaceKind = "outer" | "inner" | "rim" | "cap";
/**
 * Face da malha. `n` é a normal REAL em espaço de modelo, calculada uma única
 * vez em `finish()` — depois que posições e índices estão completos (Newell).
 * Nunca é derivada da projeção de tela, o que elimina manchas de iluminação.
 */
export type Face = {
  pts: Vec3[];
  kind: FaceKind;
  n?: Vec3;
  /**
   * Grupo de casca (corpos que se cruzam, ex.: tubo principal = 0, ramal = 1).
   * Usado apenas como desempate de profundidade na apresentação; nunca altera
   * coordenadas. Omitido em peças de corpo único.
   */
  g?: number;
};
export type Bounds = { min: Vec3; max: Vec3 };

export type WireModel = {
  faces: Face[];
  edges: Edge[];
  /** linhas técnicas (eixo, referências) */
  refLines: Edge[];
  /** maior extensão do bounding box (mm) — usada para enquadramento */
  size: number;
  bounds: Bounds;
};

export type WireParams = {
  /** diâmetro / lado maior (base) */
  d1: number;
  /** diâmetro / lado menor (topo) */
  d2: number;
  /** altura */
  h: number;
  /** excentricidade / offset */
  e?: number;
  /** número de divisões da revolução */
  seg?: number;
  /** espessura da chapa (mm) */
  t?: number;
  /** ângulo paramétrico (graus) — derivação, curva de gomos */
  ang?: number;
  /** quantidade paramétrica (gomos) */
  n?: number;
  /** variante do modelo paramétrico */
  mode?: string;
  /** lados independentes da base retangular (Quadrado → Redondo) */
  baseA?: number;
  baseB?: number;
  /** segunda excentricidade no plano da base */
  offsetY?: number;
  /** divisões reais por quadrante usadas pela triangulação */
  divisions?: number;
  /** estratégia de fabricação (Quadrado → Redondo): "single" | "two-weld" */
  strategy?: string;
};

export const DEFAULT_PARAMS: WireParams = {
  d1: 800,
  d2: 400,
  h: 500,
  e: 0,
  seg: 48,
  t: 6,
};


const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/* ------------------------------------------------------------------ */
/* 1. VALIDAÇÃO — nunca gerar NaN / Infinity / malha quebrada          */
/* ------------------------------------------------------------------ */

export type ParamIssue = { field: keyof WireParams; message: string };

function num(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

export function validateParameters(p: WireParams): ParamIssue[] {
  const out: ParamIssue[] = [];
  if (!Number.isFinite(p.d1) || p.d1 <= 0) out.push({ field: "d1", message: "Diâmetro maior inválido." });
  if (!Number.isFinite(p.d2) || p.d2 < 0) out.push({ field: "d2", message: "Diâmetro menor inválido." });
  if (!Number.isFinite(p.h) || p.h <= 0) out.push({ field: "h", message: "Altura inválida." });
  return out;
}

/** Parâmetros saneados: finitos, dentro de limites plausíveis de caldeiraria. */
export function normalizeParameters(p: WireParams): Required<WireParams> {
  const d1 = Math.min(20000, Math.max(1, num(p.d1, DEFAULT_PARAMS.d1)));
  const d2 = Math.min(20000, Math.max(0, num(p.d2, DEFAULT_PARAMS.d2)));
  const h = Math.min(20000, Math.max(1, num(p.h, DEFAULT_PARAMS.h)));
  const e = Math.max(-10000, Math.min(10000, num(p.e, 0)));
  const seg = Math.round(Math.min(72, Math.max(8, num(p.seg, 40))));
  const maxT = Math.max(0.4, Math.min(d1, d2 || d1, h) * 0.08);
  const t = Math.min(maxT, Math.max(0.4, num(p.t, Math.max(2, d1 * 0.008))));
  const ang = Math.min(180, Math.max(1, num(p.ang, 90)));
  const n = Math.round(Math.min(24, Math.max(2, num(p.n, 4))));
  const baseA = Math.min(20000, Math.max(1, num(p.baseA, d1)));
  const baseB = Math.min(20000, Math.max(1, num(p.baseB, d1)));
  const offsetY = Math.max(-10000, Math.min(10000, num(p.offsetY, 0)));
  const divisions = Math.round(Math.min(24, Math.max(3, num(p.divisions, seg / 4))));
  return {
    d1,
    d2,
    h,
    e,
    seg: seg % 4 === 0 ? seg : seg + (4 - (seg % 4)),
    t,
    ang,
    n,
    mode: typeof p.mode === "string" ? p.mode : "",
    baseA,
    baseB,
    offsetY,
    divisions,
    strategy: p.strategy === "two-weld" ? "two-weld" : "single",
  };
}


/* ------------------------------------------------------------------ */
/* 2. PRIMITIVAS DE PERFIL                                             */
/* ------------------------------------------------------------------ */

function ring(r: number, y: number, seg: number, cx = 0, cz = 0): Vec3[] {
  const rr = Math.max(r, 0.001);
  return Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return v(cx + rr * Math.cos(a), y, cz + rr * Math.sin(a));
  });
}

function squareLoop(side: number, y: number, seg: number): Vec3[] {
  const s = Math.max(side, 0.001) / 2;
  const corners: Vec2[] = [
    { x: -s, y: -s },
    { x: s, y: -s },
    { x: s, y: s },
    { x: -s, y: s },
  ];
  const per = Math.max(1, Math.round(seg / 4));
  const out: Vec3[] = [];
  for (let c = 0; c < 4; c++) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    for (let k = 0; k < per; k++) {
      const u = k / per;
      out.push(v(a.x + (b.x - a.x) * u, y, a.y + (b.y - a.y) * u));
    }
  }
  return out;
}

/** Interpolação entre dois contornos de mesma contagem (transições regradas). */
function blend(a: Vec3[], b: Vec3[], u: number, y: number): Vec3[] {
  return a.map((p, i) => {
    const q = b[i]!;
    return v(p.x + (q.x - p.x) * u, y, p.z + (q.z - p.z) * u);
  });
}

function centroid(loop: Vec3[]): Vec3 {
  const c = loop.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), v(0, 0, 0));
  const n = Math.max(1, loop.length);
  return v(c.x / n, c.y / n, c.z / n);
}

/** Contorno interno: deslocamento do contorno externo em direção ao eixo. */
function offsetLoop(loop: Vec3[], t: number): Vec3[] {
  const c = centroid(loop);
  return loop.map((p) => {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return p;
    const k = Math.min(t / len, 0.9);
    return v(p.x + dx * k, p.y, p.z + dz * k);
  });
}

/* ------------------------------------------------------------------ */
/* 3. GERAÇÃO DE MALHA                                                 */
/* ------------------------------------------------------------------ */

type ShellOpts = {
  /** espessura da parede (mm) */
  t: number;
  /** fecha a primeira seção (tampa cheia) */
  capStart?: boolean;
  /** fecha a última seção (tampa cheia) */
  capEnd?: boolean;
  /** a cada quantas divisões desenhar uma geratriz */
  gen?: number;
};

type Geo = { faces: Face[]; edges: Edge[] };

const EMPTY: Geo = { faces: [], edges: [] };

function merge(parts: Geo[]): Geo {
  return {
    faces: parts.flatMap((p) => p.faces),
    edges: parts.flatMap((p) => p.edges),
  };
}

function loopEdges(pts: Vec3[]): Edge[] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]!] as Edge);
}

/**
 * Casca de parede fina a partir de uma sequência de contornos.
 * Gera superfície externa, superfície interna, bordas (rim) das aberturas,
 * tampas quando pedidas, e as arestas técnicas correspondentes.
 */
function shell(loops: Vec3[][], o: ShellOpts): Geo {
  const valid = loops.filter((l) => l.length >= 3);
  if (valid.length < 2) return EMPTY;
  const inner = valid.map((l) => offsetLoop(l, o.t));
  const faces: Face[] = [];
  const edges: Edge[] = [];
  const n = valid[0]!.length;
  const gen = Math.max(1, o.gen ?? Math.round(n / 8));

  for (let s = 0; s < valid.length - 1; s++) {
    const a = valid[s]!;
    const b = valid[s + 1]!;
    const ai = inner[s]!;
    const bi = inner[s + 1]!;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push({ pts: [a[i]!, a[j]!, b[j]!, b[i]!], kind: "outer" });
      faces.push({ pts: [bi[i]!, bi[j]!, ai[j]!, ai[i]!], kind: "inner" });
    }
  }

  // arestas: contornos extremos + geratrizes reais da superfície
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  edges.push(...loopEdges(first), ...loopEdges(last));
  if (!o.capStart) edges.push(...loopEdges(inner[0]!));
  if (!o.capEnd) edges.push(...loopEdges(inner[inner.length - 1]!));
  for (let i = 0; i < n; i += gen) {
    for (let s = 0; s < valid.length - 1; s++) {
      edges.push([valid[s]![i]!, valid[s + 1]![i]!]);
    }
  }

  // bordas das aberturas (espessura visível)
  const rim = (out: Vec3[], inn: Vec3[]) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push({ pts: [out[i]!, out[j]!, inn[j]!, inn[i]!], kind: "rim" });
    }
  };
  if (o.capStart) faces.push({ pts: first, kind: "cap" });
  else rim(first, inner[0]!);
  if (o.capEnd) faces.push({ pts: last, kind: "cap" });
  else rim(last, inner[inner.length - 1]!);

  return { faces, edges };
}

function boundsOf(faces: Face[]): Bounds {
  const min = v(Infinity, Infinity, Infinity);
  const max = v(-Infinity, -Infinity, -Infinity);
  for (const f of faces)
    for (const p of f.pts) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
  if (!Number.isFinite(min.x)) return { min: v(-1, -1, -1), max: v(1, 1, 1) };
  return { min, max };
}

/**
 * Normais da malha (equivalente a `computeVertexNormals`): executado UMA vez,
 * depois que todas as faces de todas as partes já estão definidas. Newell
 * suporta polígonos não triangulares e faces levemente não planares.
 */
function computeFaceNormals(faces: Face[]): void {
  for (const f of faces) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    const pts = f.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    const len = Math.hypot(nx, ny, nz);
    f.n = len > 1e-9 ? v(nx / len, ny / len, nz / len) : v(0, 1, 0);
  }
}

function finish(geo: Geo, refLines: Edge[] = []): WireModel {
  // 1. malha completa → 2. normais → 3. bounding box (nesta ordem, sempre)
  computeFaceNormals(geo.faces);
  const bounds = boundsOf(geo.faces);
  const size =
    Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) ||
    1;
  return { faces: geo.faces, edges: geo.edges, refLines, size, bounds };
}

/** Eixo da peça + linha de base: referências geométricas reais. */
function axisLines(b: Bounds): Edge[] {
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const pad = (b.max.y - b.min.y) * 0.12;
  return [[v(cx, b.min.y - pad, cz), v(cx, b.max.y + pad, cz)]];
}

/* ------------------------------------------------------------------ */
/* 4. MODELOS PARAMÉTRICOS                                             */
/* ------------------------------------------------------------------ */

/** Sequência de contornos de um tronco (base → topo), com excentricidade. */
function frustumLoops(r1: number, r2: number, h: number, seg: number, ex: number, steps = 2) {
  const y0 = -h / 2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    return ring(r1 + (r2 - r1) * u, y0 + h * u, seg, ex * u, 0);
  });
}

/** Constrói a geometria 3D real da peça a partir dos parâmetros. */
export function buildWire(slug: string, raw: WireParams): WireModel {
  const p = normalizeParameters(raw);
  const { seg, t } = p;
  const h = p.h;
  const r1 = p.d1 / 2;
  const r2 = p.d2 / 2;
  const y0 = -h / 2;
  const y1 = h / 2;

  const withAxis = (geo: Geo, extraRefs: Edge[] = []) => {
    const m = finish(geo);
    return { ...m, refLines: [...axisLines(m.bounds), ...extraRefs] };
  };

  switch (slug) {
    case "cilindro":
    case "dutos":
      return withAxis(shell(frustumLoops(r1, r1, h, seg, 0, 2), { t }));

    case "cone": {
      // ápice modelado com raio mínimo: evita triângulos degenerados
      const tip = Math.max(r1 * 0.012, t * 0.6);
      return withAxis(shell(frustumLoops(r1, tip, h, seg, 0, 3), { t }));
    }

    case "tronco-de-cone":
    case "reducao-circular":
    case "chamines":
      return withAxis(shell(frustumLoops(r1, r2, h, seg, 0, 2), { t }));

    case "cone-excentrico":
      return withAxis(shell(frustumLoops(r1, r2, h, seg, r1 - r2, 3), { t }));

    case "quadrado-redondo":
    case "transicoes": {
      const canonical = buildSquareToRoundModel({
        baseA: p.baseA,
        baseB: p.baseB,
        topDiameter: p.d2,
        height: p.h,
        offsetX: p.e,
        offsetY: p.offsetY,
        divisions: p.divisions,
        thickness: p.t,
        density: 7.85,
        strategy: p.strategy === "two-weld" ? "two-weld" : "single",
      });
      const cv = (q: Vec3) => v(q.x, q.z - p.h / 2, q.y);
      const inset = (q: Vec3) => {
        if (q.z === 0) {
          const x = Math.sign(q.x) * Math.max(0, Math.abs(q.x) - p.t);
          const z = Math.sign(q.y) * Math.max(0, Math.abs(q.y) - p.t);
          return v(x, -p.h / 2, z);
        }
        const dx = q.x - p.e;
        const dz = q.y - p.offsetY;
        const radius = Math.hypot(dx, dz);
        const ratio = radius > 0 ? Math.max(0, radius - p.t) / radius : 1;
        return v(p.e + dx * ratio, p.h / 2, p.offsetY + dz * ratio);
      };
      const faces: Face[] = [];
      const edges: Edge[] = [];
      for (const face of canonical.faces) {
        const outer = face.points.map(cv);
        const inner = face.points.map((q) => inset(q));
        faces.push({ pts: outer, kind: "outer" });
        faces.push({ pts: inner.slice().reverse(), kind: "inner" });
      }
      edges.push(...canonical.generatrices.map((line) => [cv(line.a), cv(line.b)] as Edge));

      for (let k = 0; k < canonical.corners.length; k++) {
        const a = canonical.corners[k];
        const b = canonical.corners[(k + 1) % canonical.corners.length];
        if (!a || !b) continue;
        const ao = cv(a);
        const bo = cv(b);
        faces.push({ pts: [ao, bo, inset(b), inset(a)], kind: "rim" });
        edges.push([ao, bo]);
      }
      for (let k = 0; k < canonical.circle.length; k++) {
        const a = canonical.circle[k];
        const b = canonical.circle[(k + 1) % canonical.circle.length];
        if (!a || !b) continue;
        const ao = cv(a);
        const bo = cv(b);
        faces.push({ pts: [ao, bo, inset(b), inset(a)], kind: "rim" });
        edges.push([ao, bo]);
      }

      // Emendas soldadas (modo 2 partes + solda): posição real das costuras J1/J2.
      const seamRefs: Edge[] = [];
      if (p.strategy === "two-weld") {
        const midpoint = (a: typeof canonical.corners[number], b: typeof canonical.corners[number]) => ({
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0,
        });
        seamRefs.push(
          [cv(midpoint(canonical.corners[0]!, canonical.corners[1]!)), cv(canonical.arcPoints[0]!.at(-1)!)],
          [cv(midpoint(canonical.corners[2]!, canonical.corners[3]!)), cv(canonical.arcPoints[2]!.at(-1)!)],
        );
      }

      return withAxis({ faces, edges }, seamRefs);
    }

    case "redondo-quadrado": {
      const steps = 8;
      const ci = ring(r1, y0, seg);
      const sq = squareLoop(p.d2, y1, seg);
      const loops = Array.from({ length: steps + 1 }, (_, i) => {
        const u = i / steps;
        return blend(ci, sq, u, y0 + h * u);
      });
      return withAxis(shell(loops, { t }));
    }

    case "boca-de-lobo": {
      if (p.mode === "branch") {
        /*
         * Boca de lobo real: tubo principal (eixo X) + derivação inclinada,
         * cortada exatamente pela linha de interseção calculada em
         * `geometry/branch` — a mesma equação da planificação.
         */
        const input = {
          mainDiameter: p.d1,
          branchDiameter: p.d2,
          angleDeg: p.ang,
          offset: p.e,
          branchLength: Math.max(p.h, p.d1 * 0.6),
          divisions: seg,
        };
        const R = p.d1 / 2;
        const rb = p.d2 / 2;
        const a = (p.ang * Math.PI) / 180;
        const half = Math.max(p.d1 * 0.9, rb * 3);
        const mainLoops = [-half, -half / 2, 0, half / 2, half].map((x) =>
          Array.from({ length: seg }, (_, i) => {
            const φ = (i / seg) * Math.PI * 2;
            return v(x, R * Math.cos(φ), R * Math.sin(φ));
          }),
        );
        const main = shell(mainLoops, { t });

        const steps = 5;
        const branchLoops = Array.from({ length: steps + 1 }, (_, s) => {
          const u = s / steps;
          return Array.from({ length: seg }, (_, i) => {
            const θ = (i / seg) * Math.PI * 2;
            const t0 = branchAxisLength(input, θ);
            const tt = t0 + (input.branchLength - t0) * u;
            return v(
              tt * Math.cos(a) - rb * Math.sin(θ) * Math.sin(a),
              tt * Math.sin(a) + rb * Math.sin(θ) * Math.cos(a),
              p.e + rb * Math.cos(θ),
            );
          });
        });
        const branch = shell(branchLoops, { t });
        return withAxis(merge([main, branch]));
      }
      // cilindro cortado por plano inclinado: altura varia com z
      const steps = 6;
      const base = ring(r1, y0, seg);
      const top = base.map((q) => v(q.x, y0 + h * (0.4 + 0.6 * ((q.z / r1 + 1) / 2)), q.z));
      const loops = Array.from({ length: steps + 1 }, (_, i) => {
        const u = i / steps;
        return base.map((q, k) => v(q.x, q.y + (top[k]!.y - q.y) * u, q.z));
      });
      return withAxis(shell(loops, { t }));
    }


    case "te":
    case "interseccoes": {
      const main = shell(frustumLoops(r1, r1, h, seg, 0, 2), { t });
      const armLen = r1 + h * 0.45;
      const branch = shell(
        Array.from({ length: 5 }, (_, i) => {
          const z = r1 * 0.2 + (armLen - r1 * 0.2) * (i / 4);
          return ring(r2, 0, seg).map((q) => v(q.x, q.z, z));
        }),
        { t },
      );
      return withAxis(merge([main, branch]));
    }

    case "y": {
      const half = h / 2;
      const trunk = shell(
        Array.from({ length: 4 }, (_, i) => ring(r1, y0 + (half * i) / 3, seg)),
        { t },
      );
      const arm = (dir: number) =>
        shell(
          Array.from({ length: 5 }, (_, i) => {
            const u = i / 4;
            return ring(r1 + (r2 - r1) * u, half * u, seg, dir * r1 * 0.8 * u, 0).map((q) =>
              v(q.x, q.y, q.z),
            );
          }),
          { t },
        );
      return withAxis(merge([trunk, arm(-1), arm(1)]));
    }

    case "curva-de-gomos": {
      /*
       * Curva de gomos real: a linha de centro e os planos de corte vêm de
       * `geometry/elbowSegments` — as mesmas peças da planificação.
       * O ângulo total e a quantidade de gomos são parâmetros.
       */
      const model = elbowModel({
        diameter: p.d2,
        radius: p.d1,
        angleDeg: p.ang,
        gores: p.n,
        divisions: seg,
      });
      const rb = p.d2 / 2;
      const beta = model.beta;
      const k = 1 / Math.max(Math.cos(beta), 0.15);
      const loops: Vec3[][] = [];
      model.centerline.forEach((c, j) => {
        const prev = model.segments[j - 1];
        const next = model.segments[j];
        const dirs = [prev?.rotationDeg, next?.rotationDeg].filter((x) => x !== undefined) as number[];
        const φm = ((dirs.reduce((s, x) => s + x, 0) / dirs.length) * Math.PI) / 180;
        const mitred = dirs.length === 2;
        const ax = mitred ? k : 1;
        loops.push(
          Array.from({ length: seg }, (_, i) => {
            const θ = (i / seg) * Math.PI * 2;
            const s = rb * ax * Math.sin(θ);
            return v(c.x - s * Math.sin(φm), c.y + s * Math.cos(φm), rb * Math.cos(θ));
          }),
        );
      });
      return withAxis(shell(loops, { t }));
    }


    case "flanges": {
      const thick = Math.max(h * 0.12, t * 2);
      const disc = shell(
        [ring(r1, -thick / 2, seg), ring(r1, thick / 2, seg)],
        { t: Math.max(r1 - r2, t) },
      );
      const holes = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const c = (r1 + r2) / 2;
        const rr = Math.max(r1 * 0.07, 2);
        return shell(
          [
            ring(rr, -thick / 2, 12, c * Math.cos(a), c * Math.sin(a)),
            ring(rr, thick / 2, 12, c * Math.cos(a), c * Math.sin(a)),
          ],
          { t: rr * 0.9 },
        );
      });
      return withAxis(merge([disc, ...holes]));
    }

    case "tampas": {
      const lip = Math.max(h * 0.18, t * 3);
      return withAxis(
        shell([ring(r1, y0, seg), ring(r1, y0 + lip, seg)], { t, capStart: true }),
      );
    }

    case "calotas": {
      const layers = 8;
      const loops = Array.from({ length: layers + 1 }, (_, i) => {
        const a = ((i / layers) * Math.PI) / 2;
        return ring(Math.max(r1 * Math.cos(a), r1 * 0.02), y0 + h * Math.sin(a), seg);
      });
      return withAxis(shell(loops, { t }));
    }

    default:
      return withAxis(shell(frustumLoops(r1, r2, h, seg, 0, 2), { t }));
  }
}

/* ------------------------------------------------------------------ */
/* 5. CÂMERA (apresentação — nunca altera a geometria)                 */
/* ------------------------------------------------------------------ */

export type Camera = { yaw: number; pitch: number; zoom: number };

/** Projeção ortográfica com rotação yaw/pitch. Retorna coordenadas de tela. */
export function project(pt: Vec3, cam: Camera, scale: number): Vec2 & { depth: number } {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const x1 = pt.x * cy - pt.z * sy;
  const z1 = pt.x * sy + pt.z * cy;
  const y1 = pt.y * cp - z1 * sp;
  const z2 = pt.y * sp + z1 * cp;
  const k = scale * cam.zoom;
  return { x: x1 * k, y: -y1 * k, depth: z2 };
}

/**
 * Enquadramento automático: raio necessário para conter a peça em qualquer
 * ângulo de rotação (bounding sphere do bounding box real).
 */
export function fitRadius(b: Bounds): number {
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const rx = Math.max(b.max.x - cx, cx - b.min.x);
  const ry = Math.max(b.max.y - cy, cy - b.min.y);
  const rz = Math.max(b.max.z - cz, cz - b.min.z);
  return Math.max(Math.hypot(rx, rz), ry, 0.001);
}

/** Centro geométrico real da peça (usado como alvo da câmera). */
export function centerOf(b: Bounds): Vec3 {
  return v((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
}
