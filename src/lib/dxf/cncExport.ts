/**
 * EXPORTADOR DXF CNC — dedicado à fabricação.
 *
 * A operação de cada entidade vem do seu PAPEL (ManufacturingRole), nunca
 * da cor. O papel é traduzido para um nome de layer no arquivo pelo
 * DxfExportProfile escolhido (DXF TÉCNICO / DXF LASER CNC).
 *
 * NUNCA entram aqui: grade, moldura, cursor, seleção, chevrons de FLUXO,
 * selos, indicadores de interface. Setas de direção são metadado e jamais
 * viram geometria.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { DxfDocument, DxfEntity, DxfXdata } from "@/lib/dxf/dxfService";
import { appIdsOf, dxfVersionFor, importDxf } from "@/lib/dxf/dxfService";
import { flattenPath } from "@/lib/lab2d/bezier";
import type { Entity } from "@/lib/lab2d/core";
import { pathLength } from "@/lib/lab2d/cutPlan";
import {
  contoursOf,
  leadPolyline,
  validateManufacturing,
  type CncIssue,
} from "@/lib/lab2d/manufacturing";
import {
  CYPCUT_APPID,
  CYPCUT_CHANNEL,
  CYPCUT_MAPPED_ROLES,
  DEFAULT_PROFILE_ID,
  ENTITY_ROLES,
  LASER_PROFILE_ID,
  EXPORT_ACI,
  profileById,
  roleOf,
  ROLE_LABEL,
  structureMap,
  unclassifiedOf,
  type EntityRole,
  type ManufacturingRole,
} from "@/lib/lab2d/roles";

/** Papéis diretamente selecionáveis na exportação. */
export type CncRole = EntityRole;

export type CncExportOptions = {
  /** Perfil de exportação (mapeamento papel → layer do arquivo). */
  profileId: string;
  /** Papéis habilitados pelo usuário. */
  roles: Record<CncRole, boolean>;
  /** Escrever os lead-in/lead-out como geometria no arquivo. */
  leads: boolean;
  /** Achatar curvas Bézier em polilinha (máquinas antigas). */
  flattenCurves: boolean;
  /** Incluir opcionalmente anotações técnicas como TEXT na layer ANOTACOES (desativado por padrão). */
  includeAnnotations?: boolean;
};

export const DEFAULT_CNC_OPTIONS: CncExportOptions = {
  profileId: DEFAULT_PROFILE_ID,
  roles: { CUT: true, RECORTE: true, MARK: true, BEND: true, REFERENCE: false, DIMENSION: false },
  leads: true,
  flattenCurves: false,
  includeAnnotations: false,
};

/** DXF é Y para cima; o modelo do CHAMFER é Y para baixo. */
const m = (p: Vec2) => ({ x: p.x, y: -p.y });

/**
 * Layer de saída de um papel, definida EXCLUSIVAMENTE pelo perfil.
 * Nenhum papel é convertido em outro: DOBRA nunca vira MARCAÇÃO.
 */
export function exportLayerOf(role: ManufacturingRole, opts: CncExportOptions): string | null {
  return profileById(opts.profileId).layerMap[role] ?? null;
}

/** Mapeamento visível ao usuário antes de exportar. */
export function layerMapping(opts: CncExportOptions) {
  return ENTITY_ROLES.map((role) => ({
    role,
    label: ROLE_LABEL[role],
    enabled: opts.roles[role],
    layer: opts.roles[role] ? exportLayerOf(role, opts) : null,
  }));
}

/** Converte uma elipse interna em uma LWPOLYLINE fechada de 8 arcos tangentes com bulge (modo Laser/CypCut). */
function ellipseToTangentArcLwPolyline(
  e: Extract<Entity, { type: "ellipse" }>,
  layer: string,
  segments = 8,
): DxfEntity {
  const rot = e.rotation ?? 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const toWorld = (u: number, v: number): Vec2 => ({
    x: e.cx + u * cosR - v * sinR,
    y: e.cy + u * sinR + v * cosR,
  });
  const pts: { x: number; y: number; bulge?: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    const p0 = m(toWorld(e.rx * Math.cos(t0), e.ry * Math.sin(t0)));
    const p1 = m(toWorld(e.rx * Math.cos(t1), e.ry * Math.sin(t1)));
    const pm = m(toWorld(e.rx * Math.cos(tm), e.ry * Math.sin(tm)));
    const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    let bulge = 0;
    if (chord > 1e-6) {
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const sag = Math.hypot(pm.x - mx, pm.y - my);
      const cross = (p1.x - p0.x) * (pm.y - p0.y) - (p1.y - p0.y) * (pm.x - p0.x);
      const sign = cross >= 0 ? -1 : 1;
      bulge = sign * ((2 * sag) / chord);
    }
    pts.push(Math.abs(bulge) > 1e-7 ? { x: p0.x, y: p0.y, bulge } : p0);
  }
  return { type: "LWPOLYLINE", layer, closed: true, points: pts };
}

/** Solda cadeias conexas de LINE e ARC de corte na mesma camada em uma única LWPOLYLINE com bulge. */
export function weldConnectedCutChains(entities: Entity[], weldTolMm = 0.05): Entity[] {
  type SegItem = {
    entIdx: number;
    layer: string;
    p0: Vec2;
    p1: Vec2;
    bulgeForward: number;
  };
  const candidates: SegItem[] = [];
  const candidateIndiceSet = new Set<number>();

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    const role = roleOf(e);
    if (role !== "CUT" && role !== "RECORTE") continue;
    if (e.type === "line") {
      candidates.push({
        entIdx: i,
        layer: e.layer,
        p0: { x: e.x1, y: e.y1 },
        p1: { x: e.x2, y: e.y2 },
        bulgeForward: 0,
      });
      candidateIndiceSet.add(i);
    } else if (e.type === "arc") {
      let sweep = e.a1 - e.a0;
      while (sweep <= 0) sweep += Math.PI * 2;
      while (sweep > Math.PI * 2) sweep -= Math.PI * 2;
      if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
      const p0 = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
      const p1 = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
      candidates.push({
        entIdx: i,
        layer: e.layer,
        p0,
        p1,
        bulgeForward: Math.tan(sweep / 4),
      });
      candidateIndiceSet.add(i);
    }
  }

  if (candidates.length < 2) return entities;

  const used = new Array<boolean>(candidates.length).fill(false);
  const weldedByFirstIdx = new Map<number, Entity>();
  const absorbedIndices = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (used[i]) continue;
    const startSeg = candidates[i]!;
    const chain: { p0: Vec2; p1: Vec2; bulge: number; entIdx: number }[] = [
      { p0: startSeg.p0, p1: startSeg.p1, bulge: startSeg.bulgeForward, entIdx: startSeg.entIdx },
    ];
    used[i] = true;

    let progress = true;
    while (progress) {
      progress = false;
      const tail = chain[chain.length - 1]!.p1;
      const head = chain[0]!.p0;
      for (let j = 0; j < candidates.length; j++) {
        if (used[j]) continue;
        const cand = candidates[j]!;
        if (cand.layer !== startSeg.layer) continue;
        const dTail0 = Math.hypot(cand.p0.x - tail.x, cand.p0.y - tail.y);
        const dTail1 = Math.hypot(cand.p1.x - tail.x, cand.p1.y - tail.y);
        if (dTail0 <= weldTolMm) {
          chain.push({ p0: tail, p1: cand.p1, bulge: cand.bulgeForward, entIdx: cand.entIdx });
          used[j] = true;
          progress = true;
          break;
        }
        if (dTail1 <= weldTolMm) {
          chain.push({ p0: tail, p1: cand.p0, bulge: -cand.bulgeForward, entIdx: cand.entIdx });
          used[j] = true;
          progress = true;
          break;
        }
        const dHead1 = Math.hypot(cand.p1.x - head.x, cand.p1.y - head.y);
        const dHead0 = Math.hypot(cand.p0.x - head.x, cand.p0.y - head.y);
        if (dHead1 <= weldTolMm) {
          chain.unshift({ p0: cand.p0, p1: head, bulge: cand.bulgeForward, entIdx: cand.entIdx });
          used[j] = true;
          progress = true;
          break;
        }
        if (dHead0 <= weldTolMm) {
          chain.unshift({ p0: cand.p1, p1: head, bulge: -cand.bulgeForward, entIdx: cand.entIdx });
          used[j] = true;
          progress = true;
          break;
        }
      }
    }

    if (chain.length >= 2) {
      const firstPt = chain[0]!.p0;
      const lastPt = chain[chain.length - 1]!.p1;
      const isClosed = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y) <= Math.max(weldTolMm * 2, 0.1);
      const pts: Vec2[] = chain.map((s) => s.p0);
      const bulges: number[] = chain.map((s) => s.bulge);
      if (!isClosed) {
        pts.push(lastPt);
        bulges.push(0);
      }
      const hasBulge = bulges.some((b) => Math.abs(b) > 1e-7);
      const firstEnt = entities[startSeg.entIdx]!;
      weldedByFirstIdx.set(startSeg.entIdx, {
        id: firstEnt.id,
        layer: startSeg.layer,
        type: "polyline",
        closed: isClosed,
        pts,
        bulges: hasBulge ? bulges : undefined,
      });
      for (const s of chain) absorbedIndices.add(s.entIdx);
    }
  }

  if (weldedByFirstIdx.size === 0) return entities;

  const out: Entity[] = [];
  for (let i = 0; i < entities.length; i++) {
    if (weldedByFirstIdx.has(i)) {
      out.push(weldedByFirstIdx.get(i)!);
    } else if (!absorbedIndices.has(i) || !candidateIndiceSet.has(i)) {
      out.push(entities[i]!);
    }
  }
  return out;
}

function geometryOf(e: Entity, layer: string, flatten: boolean, cypcut = true): DxfEntity[] {
  switch (e.type) {
    case "line":
      return [
        { type: "LINE", layer, start: m({ x: e.x1, y: e.y1 }), end: m({ x: e.x2, y: e.y2 }) },
      ];
    case "polyline":
      return [
        {
          type: "LWPOLYLINE",
          layer,
          closed: e.closed,
          points: e.pts.map((pt, idx) => {
            const mp = m(pt);
            const b = e.bulges?.[idx];
            return b !== undefined && Math.abs(b) > 1e-7
              ? { x: mp.x, y: mp.y, bulge: -b }
              : mp;
          }),
        },
      ];
    case "circle":
      return [{ type: "CIRCLE", layer, center: m({ x: e.cx, y: e.cy }), radius: e.r }];
    case "arc": {
      const deg = (r: number) => ((((-r * 180) / Math.PI) % 360) + 360) % 360;
      return [
        {
          type: "ARC",
          layer,
          center: m({ x: e.cx, y: e.cy }),
          radius: e.r,
          startAngle: deg(e.a1),
          endAngle: deg(e.a0),
        },
      ];
    }
    case "ellipse": {
      if (cypcut || flatten) {
        return [ellipseToTangentArcLwPolyline(e, layer, 8)];
      }
      const rot = e.rotation ?? 0;
      const majorIsX = e.rx >= e.ry;
      const majorLen = Math.max(e.rx, e.ry);
      const minorLen = Math.min(e.rx, e.ry);
      const majorAng = majorIsX ? rot : rot + Math.PI / 2;
      const majorVec = m({
        x: majorLen * Math.cos(majorAng),
        y: majorLen * Math.sin(majorAng),
      });
      return [
        {
          type: "ELLIPSE",
          layer,
          center: m({ x: e.cx, y: e.cy }),
          majorEnd: majorVec,
          axisRatio: majorLen > 1e-6 ? minorLen / majorLen : 1,
          startParam: 0,
          endParam: Math.PI * 2,
        },
      ];
    }
    case "path": {
      if (flatten)
        return [
          {
            type: "LWPOLYLINE",
            layer,
            closed: e.closed,
            points: flattenPath(e.start, e.segs, e.closed, 16).map(m),
          },
        ];
      const controls: Vec2[] = [m(e.start)];
      let cur = e.start;
      for (const s of e.segs) {
        const c1 = s.line
          ? { x: cur.x + (s.p.x - cur.x) / 3, y: cur.y + (s.p.y - cur.y) / 3 }
          : s.c1;
        const c2 = s.line
          ? { x: cur.x + (2 * (s.p.x - cur.x)) / 3, y: cur.y + (2 * (s.p.y - cur.y)) / 3 }
          : s.c2;
        controls.push(m(c1), m(c2), m(s.p));
        cur = s.p;
      }
      return controls.length >= 4 ? [{ type: "SPLINE", layer, controls, closed: e.closed }] : [];
    }
    default:
      return [];
  }
}

/* --------------------------------------------------------------- contagem */

export type CncCounts = Record<CncRole, number> & {
  leadIn: number;
  leadOut: number;
  contours: number;
  unclassified: number;
  outer: number;
  holes: number;
  slots: number;
  internal: number;
};

export function cncCounts(entities: Entity[]): CncCounts {
  const c: CncCounts = {
    CUT: 0,
    RECORTE: 0,
    MARK: 0,
    BEND: 0,
    REFERENCE: 0,
    DIMENSION: 0,
    leadIn: 0,
    leadOut: 0,
    contours: contoursOf(entities).length,
    unclassified: unclassifiedOf(entities).length,
    outer: 0,
    holes: 0,
    slots: 0,
    internal: 0,
  };
  const structure = structureMap(entities);
  for (const e of entities) {
    const r = roleOf(e);
    if (r && (ENTITY_ROLES as ManufacturingRole[]).includes(r)) c[r as CncRole]++;
    if (e.type === "text") continue;
    if (leadPolyline(e, "in")) c.leadIn++;
    if (leadPolyline(e, "out")) c.leadOut++;
    switch (structure.get(e.id)) {
      case "outer":
        c.outer++;
        break;
      case "hole":
        c.holes++;
        break;
      case "slot":
        c.slots++;
        break;
      case "internal":
        c.internal++;
        break;
      default:
        break;
    }
  }
  return c;
}

/**
 * DADOS ESTENDIDOS FS_CYPCUT.
 *
 * Estrutura observada no golden sample aceito pelo CypCut: Channel (canal
 * de processo, ver CYPCUT_CHANNEL), LeadIn/LeadOut (listas de parâmetros de
 * entrada e saída), IsFill, PathStart e ToolCompensation. Os valores nulos
 * significam "usar a configuração da máquina" — o CALDRA não inventa
 * parâmetros de processo.
 */
export function cypcutXdata(role: ManufacturingRole): DxfXdata {
  return {
    appId: CYPCUT_APPID,
    pairs: [
      { code: 1000, value: "Channel" },
      { code: 1070, value: CYPCUT_CHANNEL[role] },
      { code: 1000, value: "LeadIn" },
      { code: 1002, value: "{" },
      { code: 1070, value: 0 },
      { code: 1040, value: 0 },
      { code: 1040, value: 0 },
      { code: 1040, value: 0 },
      { code: 1040, value: 0 },
      { code: 1070, value: 0 },
      { code: 1040, value: 0 },
      { code: 1070, value: 0 },
      { code: 1002, value: "}" },
      { code: 1000, value: "LeadOut" },
      { code: 1002, value: "{" },
      { code: 1070, value: 0 },
      { code: 1040, value: 0 },
      { code: 1040, value: 0 },
      { code: 1040, value: 0 },
      { code: 1070, value: 0 },
      { code: 1002, value: "}" },
      { code: 1000, value: "IsFill" },
      { code: 1070, value: 0 },
      { code: 1000, value: "PathStart" },
      { code: 1040, value: 0 },
      { code: 1000, value: "ToolCompensation" },
      { code: 1002, value: "{" },
      { code: 1070, value: 0 },
      { code: 1040, value: 0 },
      { code: 1070, value: 0 },
      { code: 1002, value: "}" },
    ],
  };
}

/** O perfil escolhido pede a estrutura estendida do CypCut? */
export const isCypcutProfile = (opts: CncExportOptions) =>
  profileById(opts.profileId).id === LASER_PROFILE_ID;

/**
 * Constrói o documento DXF CNC.
 * A ORDEM do array de entidades é a intenção de sequência do CALDRA e é
 * preservada na estrutura do arquivo (o CypCut pode reordenar segundo a
 * própria configuração — isso é comportamento do software de destino).
 */
export function buildCncDxf(entities: Entity[], opts: CncExportOptions): DxfDocument {
  const out: DxfEntity[] = [];
  const used: string[] = [];
  const cypcut = isCypcutProfile(opts);
  const registerLayer = (name: string) => {
    if (!used.includes(name)) used.push(name);
    return name;
  };
  const tag = (list: DxfEntity[], role: ManufacturingRole) => {
    if (!cypcut) return list;
    const xdata = [cypcutXdata(role)];
    return list.map((e) => ({ ...e, xdata }) as DxfEntity);
  };

  const preparedEntities = weldConnectedCutChains(entities, 0.05);

  for (const e of preparedEntities) {
    if (e.type === "text") {
      if (!opts.includeAnnotations) continue; // textos técnicos não vão para o arquivo de corte por padrão
      const noteLayer = registerLayer("ANOTACOES");
      const rawRich = (e.params as { richNote?: { runs?: { text?: string }[]; fontSizeMm?: number; rotationDeg?: number } } | undefined)?.richNote;
      const fullText = rawRich?.runs?.length
        ? rawRich.runs.map((r) => r.text ?? "").join("")
        : e.text;
      const fontH = Math.max(1, rawRich?.fontSizeMm ?? e.size ?? 4);
      const rotDeg = -(rawRich?.rotationDeg ?? 0);
      const lines = fullText.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
      lines.forEach((ln, idx) => {
        const pt = m({ x: e.x, y: e.y + idx * fontH * 1.35 });
        out.push({
          type: "TEXT",
          layer: noteLayer,
          position: pt,
          height: fontH,
          text: ln,
          ...(Math.abs(rotDeg) > 1e-4 ? { rotation: rotDeg } : {}),
        });
      });
      continue;
    }
    const role = roleOf(e);
    if (!role || !(ENTITY_ROLES as ManufacturingRole[]).includes(role)) continue;
    if (!opts.roles[role as CncRole]) continue;
    const layer = exportLayerOf(role, opts);
    if (!layer) continue;
    registerLayer(layer);

    const isCut = role === "CUT";
    if (opts.leads && isCut) {
      const lin = leadPolyline(e, "in");
      const target = exportLayerOf("LEAD_IN", opts);
      if (lin && target)
        out.push(
          ...tag(
            [
              {
                type: "LWPOLYLINE",
                layer: registerLayer(target),
                closed: false,
                points: lin.map(m),
              },
            ],
            "LEAD_IN",
          ),
        );
    }
    out.push(...tag(geometryOf(e, layer, opts.flattenCurves, cypcut), role));
    if (opts.leads && isCut) {
      const lout = leadPolyline(e, "out");
      const target = exportLayerOf("LEAD_OUT", opts);
      if (lout && target)
        out.push(
          ...tag(
            [
              {
                type: "LWPOLYLINE",
                layer: registerLayer(target),
                closed: false,
                points: lout.map(m),
              },
            ],
            "LEAD_OUT",
          ),
        );
    }
  }

  return {
    layers: used.map((name, i) => ({ name, color: EXPORT_ACI[name] ?? i + 1 })),
    entities: out,
    ...(cypcut ? { appIds: [CYPCUT_APPID] } : {}),
  };
}

/* ------------------------------------------------- validação de fabricação */

/**
 * Validação semântica antes do download: classificação, duplicação,
 * segmentos degenerados e fechamento do contorno de corte.
 */
export function validateCncExport(entities: Entity[], opts: CncExportOptions): CncIssue[] {
  const issues: CncIssue[] = [...validateManufacturing(entities)];

  for (const e of unclassifiedOf(entities))
    issues.push({
      level: "error",
      scope: "Classificação",
      message: `Entidade ${e.type} sem função de fabricação (camada "${e.layer}").`,
    });

  const structure = structureMap(entities);
  const outer = entities.filter((e) => structure.get(e.id) === "outer");
  if (opts.roles.CUT && outer.length === 0)
    issues.push({
      level: "error",
      scope: "Contorno",
      message: "Nenhum contorno externo fechado de corte identificado.",
    });

  for (const c of contoursOf(entities))
    if (!c.closed)
      issues.push({
        level: "warning",
        scope: `Contorno ${String(c.sequence).padStart(2, "0")}`,
        message: "Contorno de corte aberto (possível gap).",
      });

  const doc = buildCncDxf(entities, opts);
  for (const e of doc.entities) {
    if (e.type === "LINE" && Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y) < 0.01)
      issues.push({ level: "warning", scope: "Geometria", message: "Segmento degenerado." });
    if (e.type === "CIRCLE" && e.radius < 0.05)
      issues.push({ level: "warning", scope: "Geometria", message: "Círculo degenerado." });
  }
  if (!doc.entities.length)
    issues.push({
      level: "error",
      scope: "Exportação",
      message: "Nenhuma geometria nas layers escolhidas.",
    });

  // entidades CUT duplicadas (mesma geometria, tolerância de 0,001 mm)
  const cutKeys = new Set<string>();
  for (const e of doc.entities.filter((x) => x.layer === exportLayerOf("CUT", opts))) {
    const key = JSON.stringify(e, (k, v) =>
      typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
    );
    if (cutKeys.has(key))
      issues.push({
        level: "warning",
        scope: "Geometria",
        message: "Entidade CUT duplicada.",
      });
    cutKeys.add(key);
  }

  // todo layer usado precisa existir na tabela LAYER do documento
  const declared = new Set(doc.layers.map((l) => l.name));
  for (const e of doc.entities)
    if (!declared.has(e.layer))
      issues.push({
        level: "error",
        scope: "Layers",
        message: `Entidade em layer inexistente na tabela: "${e.layer}".`,
      });

  // versão declarada compatível com as entidades emitidas
  const version = dxfVersionFor(doc);
  const hasLw = doc.entities.some((e) => e.type === "LWPOLYLINE");
  const hasSpline = doc.entities.some((e) => e.type === "SPLINE");
  if (version === "AC1009" && (hasLw || hasSpline))
    issues.push({
      level: "error",
      scope: "Versão DXF",
      message: `Versão ${version} incompatível com as entidades emitidas.`,
    });

  return issues;
}

/* ------------------------------------------------- verificação do arquivo */

export type CncVerification = {
  ok: boolean;
  rows: { field: string; expected: string; actual: string; ok: boolean }[];
};

/** Relê o DXF gerado com o importador interno e compara com o modelo. */
export function verifyCncDxf(
  entities: Entity[],
  opts: CncExportOptions,
  dxfText: string,
): CncVerification {
  const doc = buildCncDxf(entities, opts);
  const back = importDxf(dxfText);
  const rows: CncVerification["rows"] = [];

  const push = (field: string, expected: unknown, actual: unknown) => {
    const e = String(expected);
    const a = String(actual);
    rows.push({ field, expected: e, actual: a, ok: e === a });
  };

  push("Entidades", doc.entities.length, back.entities.length);
  for (const l of doc.layers) {
    push(
      `Layer ${l.name}`,
      doc.entities.filter((e) => e.layer === l.name).length,
      back.entities.filter((e) => e.layer === l.name).length,
    );
  }
  const segLen = (
    p0: { x: number; y: number; bulge?: number },
    p1: { x: number; y: number },
  ): number => {
    const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const b = p0.bulge ?? 0;
    if (Math.abs(b) <= 1e-7 || chord <= 1e-9) return chord;
    const theta = 4 * Math.atan(Math.abs(b));
    const r = chord / (2 * Math.sin(theta / 2));
    return r * theta;
  };
  const lenOf = (list: DxfEntity[]) =>
    list.reduce((acc, e) => {
      if (e.type === "LINE") return acc + Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
      if (e.type === "CIRCLE") return acc + 2 * Math.PI * e.radius;
      if (e.type === "ARC") {
        const sweepDeg = ((e.endAngle - e.startAngle) % 360 + 360) % 360 || 360;
        return acc + e.radius * ((sweepDeg * Math.PI) / 180);
      }
      if (e.type === "ELLIPSE") {
        const a = Math.hypot(e.majorEnd.x, e.majorEnd.y);
        const b = a * e.axisRatio;
        const h = (a - b) ** 2 / ((a + b) ** 2 || 1);
        return acc + Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      }
      if (e.type === "LWPOLYLINE") {
        const n = e.points.length;
        if (n < 2) return acc;
        const count = e.closed ? n : n - 1;
        let polyLen = 0;
        for (let i = 0; i < count; i++) {
          polyLen += segLen(e.points[i]!, e.points[(i + 1) % n]!);
        }
        return acc + polyLen;
      }
      return acc;
    }, 0);
  push("Perímetro (mm)", lenOf(doc.entities).toFixed(1), lenOf(back.entities).toFixed(1));
  push("Unidade", "mm", /\$INSUNITS\n\s*70\n4/.test(dxfText) ? "mm" : "?");
  push("Escala", "1:1", "1:1");
  const expectedVersion = dxfVersionFor(doc);
  const declaredVersion = /\$ACADVER\n\s*1\n(\S+)/.exec(dxfText)?.[1] ?? "?";
  push("Versão DXF", expectedVersion, declaredVersion);
  push("Geometria não classificada", 0, unclassifiedOf(entities).length);

  return { ok: rows.every((r) => r.ok), rows };
}

/**
 * Seção 12 — Auditoria de Releitura Automática do DXF (Round-Trip Audit).
 * Relê o texto DXF gerado e verifica os 6 critérios obrigatórios de integridade para CypCut.
 */
export type DxfRoundTripAudit = {
  passed: boolean;
  polygonalCircularHoles: number;
  unconfirmedConcentricPairs: number;
  openCutProfiles: number;
  duplicateEntities: number;
  microSegmentsUnder005mm: number;
  circlesCount: number;
  closedBulgePolylinesCount: number;
  closedStraightPolylinesCount: number;
  ellipsesCount: number;
  issues: string[];
};

export function auditDxfRoundTrip(
  dxfText: string,
  opts: { w0Mm?: number; allowRegularPolygons?: boolean } = {},
): DxfRoundTripAudit {
  const doc = importDxf(dxfText);
  const w0Mm = opts.w0Mm ?? 1.5;
  const issues: string[] = [];

  let polygonalCircularHoles = 0;
  let unconfirmedConcentricPairs = 0;
  let openCutProfiles = 0;
  let duplicateEntities = 0;
  let microSegmentsUnder005mm = 0;
  let circlesCount = 0;
  let closedBulgePolylinesCount = 0;
  let closedStraightPolylinesCount = 0;
  let ellipsesCount = 0;

  const seenKeys = new Set<string>();
  const loopRings: { cx: number; cy: number; rMean: number; kind: string }[] = [];

  for (const e of doc.entities) {
    const key = JSON.stringify(e, (_k, v) =>
      typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
    );
    if (seenKeys.has(key)) {
      duplicateEntities++;
      issues.push(`Entidade duplicada detectada (${e.type} na layer ${e.layer}).`);
    }
    seenKeys.add(key);

    if (e.type === "CIRCLE") {
      circlesCount++;
      loopRings.push({ cx: e.center.x, cy: e.center.y, rMean: e.radius, kind: "CIRCLE" });
    } else if (e.type === "ELLIPSE") {
      ellipsesCount++;
    } else if (e.type === "LINE") {
      const len = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
      if (len < 0.05) {
        microSegmentsUnder005mm++;
        issues.push(`Microsegmento LINE de ${len.toFixed(4)} mm (< 0.05 mm).`);
      }
      if (e.layer === "CUT" || e.layer === "RECORTE") {
        openCutProfiles++;
        issues.push(`Entidade LINE avulsa em layer de corte fechado (${e.layer}).`);
      }
    } else if (e.type === "LWPOLYLINE") {
      const n = e.points.length;
      const hasBulge = e.points.some((p) => p.bulge !== undefined && Math.abs(p.bulge) > 1e-7);
      if (e.closed) {
        if (hasBulge) closedBulgePolylinesCount++;
        else closedStraightPolylinesCount++;
      } else if (e.layer === "CUT" || e.layer === "RECORTE") {
        const dClose =
          n >= 2
            ? Math.hypot(
                e.points[n - 1]!.x - e.points[0]!.x,
                e.points[n - 1]!.y - e.points[0]!.y,
              )
            : Infinity;
        if (dClose >= 0.001) {
          openCutProfiles++;
          issues.push(`LWPOLYLINE aberta em layer de corte (${e.layer}), gap=${dClose.toFixed(4)} mm.`);
        }
      }

      // Verifica microsegmentos < 0.05 mm
      const segCount = e.closed ? n : Math.max(0, n - 1);
      for (let i = 0; i < segCount; i++) {
        const p0 = e.points[i]!;
        const p1 = e.points[(i + 1) % n]!;
        const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (chord < 0.05) {
          microSegmentsUnder005mm++;
          issues.push(`Microsegmento em LWPOLYLINE de ${chord.toFixed(4)} mm (< 0.05 mm).`);
        }
      }

      // Verifica se uma LWPOLYLINE sem bulge de >= 9 lados está fingindo ser um círculo (furo facetado)
      if (e.closed && !hasBulge && n >= 9) {
        const cx = e.points.reduce((s, p) => s + p.x, 0) / n;
        const cy = e.points.reduce((s, p) => s + p.y, 0) / n;
        const radii = e.points.map((p) => Math.hypot(p.x - cx, p.y - cy));
        const rMean = radii.reduce((s, r) => s + r, 0) / n;
        const rVar =
          Math.sqrt(radii.reduce((s, r) => s + (r - rMean) ** 2, 0) / n) / Math.max(1e-6, rMean);
        if (rVar < 0.04) {
          polygonalCircularHoles++;
          issues.push(
            `Círculo/furo exportado como polígono facetado de ${n} lados sem bulge (R≈${rMean.toFixed(2)} mm).`,
          );
        }
        loopRings.push({ cx, cy, rMean, kind: "LWPOLYLINE" });
      } else if (e.closed && n >= 2) {
        const cx = e.points.reduce((s, p) => s + p.x, 0) / n;
        const cy = e.points.reduce((s, p) => s + p.y, 0) / n;
        const rMean =
          e.points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n;
        loopRings.push({ cx, cy, rMean, kind: "LWPOLYLINE" });
      }
    }
  }

  // Verifica pares de contornos concêntricos com |ΔR| <= 1.6 * w0Mm (laços gêmeos de borda interna/externa)
  for (let i = 0; i < loopRings.length; i++) {
    for (let j = i + 1; j < loopRings.length; j++) {
      const a = loopRings[i]!;
      const b = loopRings[j]!;
      const centerDist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const deltaR = Math.abs(a.rMean - b.rMean);
      if (centerDist <= 1.5 * w0Mm && deltaR <= 1.6 * w0Mm) {
        unconfirmedConcentricPairs++;
        issues.push(
          `Par concêntrico suspeito (laço duplo): Δcentro=${centerDist.toFixed(2)} mm, ΔR=${deltaR.toFixed(2)} mm.`,
        );
      }
    }
  }

  const passed =
    polygonalCircularHoles === 0 &&
    unconfirmedConcentricPairs === 0 &&
    openCutProfiles === 0 &&
    duplicateEntities === 0 &&
    microSegmentsUnder005mm === 0;

  return {
    passed,
    polygonalCircularHoles,
    unconfirmedConcentricPairs,
    openCutProfiles,
    duplicateEntities,
    microSegmentsUnder005mm,
    circlesCount,
    closedBulgePolylinesCount,
    closedStraightPolylinesCount,
    ellipsesCount,
    issues,
  };
}

/* ----------------------------------------------------- preflight CNC READY */

export type CncPreflightRow = { label: string; value: string; ok: boolean };

/**
 * Relatório de preflight exibido antes do download. Tudo em `ok === false`
 * com peso de erro já aparece também em `validateCncExport`.
 */
export function preflightCnc(entities: Entity[], opts: CncExportOptions): CncPreflightRow[] {
  const counts = cncCounts(entities);
  const doc = buildCncDxf(entities, opts);
  const issues = validateCncExport(entities, opts);
  const errors = issues.filter((i) => i.level === "error").length;
  const declared = new Set(doc.layers.map((l) => l.name));
  const layersOk = doc.entities.every((e) => declared.has(e.layer));
  const closedCuts = contoursOf(entities).filter((c) => c.closed).length;

  const cutKeys = new Set<string>();
  let dups = 0;
  for (const e of doc.entities.filter((x) => x.layer === exportLayerOf("CUT", opts))) {
    const key = JSON.stringify(e, (k, v) =>
      typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
    );
    if (cutKeys.has(key)) dups++;
    cutKeys.add(key);
  }

  const rows: CncPreflightRow[] = [
    { label: "Units", value: "mm", ok: true },
    { label: "Scale", value: "1:1", ok: true },
  ];
  for (const role of ENTITY_ROLES)
    rows.push({ label: role, value: `${counts[role]} entidades`, ok: true });
  const cypcut = isCypcutProfile(opts);
  const tagged = doc.entities.filter((e) =>
    (e.xdata ?? []).some((x) => x.appId === CYPCUT_APPID),
  ).length;
  const zeroLen = doc.entities.filter(
    (e) => e.type === "LINE" && Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y) < 0.01,
  ).length;

  rows.push(
    { label: "Layers válidos", value: layersOk ? "sim" : "não", ok: layersOk },
    {
      label: "Contornos fechados",
      value: `${closedCuts}/${counts.contours}`,
      ok: counts.contours > 0 && closedCuts === counts.contours,
    },
    { label: "Sem duplicatas", value: dups === 0 ? "sim" : `${dups}`, ok: dups === 0 },
    {
      label: "Sem segmentos nulos",
      value: zeroLen === 0 ? "sim" : `${zeroLen}`,
      ok: zeroLen === 0,
    },
    {
      label: "Funções preservadas",
      value: counts.unclassified === 0 ? "sim" : `${counts.unclassified} sem função`,
      ok: counts.unclassified === 0,
    },
    {
      label: "DXF estruturalmente válido",
      value: errors === 0 ? dxfVersionFor(doc) : `${errors} erros`,
      ok: errors === 0,
    },
  );
  if (cypcut) {
    const mfgEntitiesCount = doc.entities.filter((e) => e.type !== "TEXT").length;
    rows.push({
      label: "Estrutura CypCut (FS_CYPCUT)",
      value:
        tagged === mfgEntitiesCount && appIdsOf(doc).includes(CYPCUT_APPID)
          ? `${tagged} entidades · ${CYPCUT_MAPPED_ROLES.map((r) => CYPCUT_CHANNEL[r]).join("/")}`
          : "incompleta",
      ok: tagged === mfgEntitiesCount && mfgEntitiesCount > 0,
    });
    for (const role of CYPCUT_MAPPED_ROLES)
      rows.push({
        label: `${ROLE_LABEL[role]} → CypCut`,
        value: `Channel ${CYPCUT_CHANNEL[role]}`,
        ok: true,
      });
  }
  return rows;
}

/** Comprimento total de corte do plano, em mm. */
export const cncCutLength = (entities: Entity[]) =>
  entities
    .filter((e) => roleOf(e) === "CUT" && e.type !== "text")
    .reduce((a, e) => a + pathLength(e), 0);
