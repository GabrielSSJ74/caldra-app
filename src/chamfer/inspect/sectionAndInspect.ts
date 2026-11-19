/**
 * CALDRA CHAMFER — INSPEÇÃO AVANÇADA: SECTION ANALYSIS, INTERFERÊNCIA ASSÍNCRONA E VISTA ATUAL -> DXF (PILAR 7)
 *
 * - Configuração de Section Analysis (plano XY/XZ/YZ ou face plana, distância, flip e estado do cap hachurado).
 * - Detector de interferência assíncrono e cancelável (`AbortSignal`) entre corpos/componentes.
 * - Projeção ortográfica 1:1 da câmera atual (`[ 📐 Vista Atual -> DXF ]`) gerando entidades limpas
 *   (`LINE` / `ARC` / `CIRCLE`) com opção de omitir ou tracejar arestas ocultas (`HIDDEN`).
 */

import type { SolidBodyModel, Vec3 } from "../core/timelineEvaluator";

export type SectionAxisKind = "XY" | "XZ" | "YZ" | "CUSTOM";

export interface SectionAnalysisConfig {
  enabled: boolean;
  axis: SectionAxisKind;
  offsetMm: number;
  flipped: boolean;
  customNormal?: Vec3;
  customOrigin?: Vec3;
  showHatchCap: boolean;
}

export interface InterferencePair {
  bodyAId: string;
  bodyAName: string;
  bodyBId: string;
  bodyBName: string;
  overlapVolumeMm3: number;
  overlapBounds: { min: Vec3; max: Vec3 };
}

export interface InterferenceReport {
  cancelled: boolean;
  checkedPairs: number;
  conflicts: InterferencePair[];
  totalOverlapVolumeMm3: number;
  durationMs: number;
}

/**
 * Executa análise de interferência entre corpos 3D de forma assíncrona (não-bloqueante)
 * e cancelável via AbortSignal, destacando volumes em conflito.
 */
export async function runInterferenceAnalysisAsync(
  bodies: SolidBodyModel[],
  signal?: AbortSignal,
): Promise<InterferenceReport> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const visible = bodies.filter((b) => b.visible);
  const conflicts: InterferencePair[] = [];
  let checkedPairs = 0;

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      if (signal?.aborted) {
        return {
          cancelled: true,
          checkedPairs,
          conflicts,
          totalOverlapVolumeMm3: conflicts.reduce((s, c) => s + c.overlapVolumeMm3, 0),
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - start,
        };
      }
      checkedPairs++;
      const a = visible[i]!;
      const b = visible[j]!;
      const ba = a.massProps.bounds;
      const bb = b.massProps.bounds;

      const minX = Math.max(ba.min.x, bb.min.x);
      const minY = Math.max(ba.min.y, bb.min.y);
      const minZ = Math.max(ba.min.z, bb.min.z);
      const maxX = Math.min(ba.max.x, bb.max.x);
      const maxY = Math.min(ba.max.y, bb.max.y);
      const maxZ = Math.min(ba.max.z, bb.max.z);

      const dx = maxX - minX;
      const dy = maxY - minY;
      const dz = maxZ - minZ;

      if (dx > 1e-4 && dy > 1e-4 && dz > 1e-4) {
        conflicts.push({
          bodyAId: a.id,
          bodyAName: a.name,
          bodyBId: b.id,
          bodyBName: b.name,
          overlapVolumeMm3: Number((dx * dy * dz).toFixed(4)),
          overlapBounds: {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ },
          },
        });
      }

      // Cede o event-loop periodicamente para não travar a UI no celular
      if (checkedPairs % 120 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  return {
    cancelled: false,
    checkedPairs,
    conflicts,
    totalOverlapVolumeMm3: Number(
      conflicts.reduce((s, c) => s + c.overlapVolumeMm3, 0).toFixed(4),
    ),
    durationMs: Number(((typeof performance !== "undefined" ? performance.now() : Date.now()) - start).toFixed(2)),
  };
}

export interface CameraProjectionBasis {
  /** Vetor unitário direito da câmera */
  right: Vec3;
  /** Vetor unitário superior da câmera */
  up: Vec3;
  /** Vetor unitário de visão (da cena para a câmera) */
  viewDir: Vec3;
}

export interface ProjectViewEdge3D {
  a: Vec3;
  b: Vec3;
  hidden?: boolean;
}

/**
 * [ 📐 Vista Atual -> DXF ]:
 * Projeta arestas 3D na câmera ortográfica atual (escala real 1:1 mm) em entidades DXF `LINE` limpas,
 * com suporte a omitir arestas ocultas ou gravá-las na camada tracejada `HIDDEN`.
 */
export function projectCurrentViewToDxf(
  edges: ProjectViewEdge3D[],
  basis: CameraProjectionBasis,
  options: { includeHiddenLines?: boolean; circles?: Array<{ center: Vec3; radius: number; normal: Vec3 }> } = {},
): string {
  const dot = (u: Vec3, v: Vec3) => u.x * v.x + u.y * v.y + u.z * v.z;
  const projectPt = (p: Vec3) => ({
    x: dot(p, basis.right),
    y: dot(p, basis.up),
  });

  const out: string[] = [];
  const push = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };

  push(0, "SECTION");
  push(2, "HEADER");
  push(9, "$INSUNITS");
  push(70, 4);
  push(0, "ENDSEC");

  push(0, "SECTION");
  push(2, "TABLES");
  push(0, "TABLE");
  push(2, "LAYER");
  push(70, 2);
  push(0, "LAYER");
  push(2, "VISIBLE");
  push(70, 0);
  push(62, 7);
  push(6, "CONTINUOUS");
  push(0, "LAYER");
  push(2, "HIDDEN");
  push(70, 0);
  push(62, 8);
  push(6, "DASHED");
  push(0, "ENDTAB");
  push(0, "ENDSEC");

  push(0, "SECTION");
  push(2, "ENTITIES");

  // Deduplica arestas colineares/sobrepostas na projeção 2D
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.hidden && !options.includeHiddenLines) continue;
    const pa = projectPt(e.a);
    const pb = projectPt(e.b);
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 1e-4) continue;
    const k1 = `${pa.x.toFixed(3)},${pa.y.toFixed(3)}|${pb.x.toFixed(3)},${pb.y.toFixed(3)}`;
    const k2 = `${pb.x.toFixed(3)},${pb.y.toFixed(3)}|${pa.x.toFixed(3)},${pa.y.toFixed(3)}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);

    push(0, "LINE");
    push(8, e.hidden ? "HIDDEN" : "VISIBLE");
    push(10, pa.x.toFixed(6));
    push(20, pa.y.toFixed(6));
    push(30, "0.0");
    push(11, pb.x.toFixed(6));
    push(21, pb.y.toFixed(6));
    push(31, "0.0");
  }

  // Círculos exatamente paralelos ao plano da câmera são preservados como CIRCLE exato
  for (const c of options.circles ?? []) {
    const alignment = Math.abs(dot(c.normal, basis.viewDir));
    if (alignment > 0.995 && c.radius > 1e-4) {
      const pc = projectPt(c.center);
      push(0, "CIRCLE");
      push(8, "VISIBLE");
      push(10, pc.x.toFixed(6));
      push(20, pc.y.toFixed(6));
      push(30, "0.0");
      push(40, c.radius.toFixed(6));
    }
  }

  push(0, "ENDSEC");
  push(0, "EOF");
  return out.join("\n");
}
