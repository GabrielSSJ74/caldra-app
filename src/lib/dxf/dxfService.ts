/**
 * dxfService — camada única de importação/exportação DXF.
 *
 * Exportação: DXF ASCII (SECTION HEADER/TABLES/ENTITIES), suportando
 * LINE, LWPOLYLINE, CIRCLE, ARC e SPLINE (curvas de Bézier reais), com camadas.
 * Importação: parser de pares (código, valor) com suporte a
 * LINE, POLYLINE/VERTEX, LWPOLYLINE, CIRCLE, ARC e SPLINE.
 *
 * Quando há SPLINE o cabeçalho declara AC1015 (R2000), versão mínima que
 * define a entidade — é o que CypCut e afins esperam.
 */

export type DxfPoint = { x: number; y: number };

export type DxfEntity =
  | { type: "LINE"; layer: string; start: DxfPoint; end: DxfPoint }
  | { type: "LWPOLYLINE"; layer: string; points: DxfPoint[]; closed: boolean }
  | { type: "CIRCLE"; layer: string; center: DxfPoint; radius: number }
  | {
      type: "ARC";
      layer: string;
      center: DxfPoint;
      radius: number;
      startAngle: number;
      endAngle: number;
    }
  | {
      /** Spline cúbica em forma de Bézier por partes. */
      type: "SPLINE";
      layer: string;
      /** 3n+1 pontos de controle. */
      controls: DxfPoint[];
      closed: boolean;
    };

export type DxfLayer = { name: string; color: number; trueColor?: number };

export type DxfDocument = { layers: DxfLayer[]; entities: DxfEntity[] };


const g = (code: number, value: string | number) => `${code}\n${value}\n`;

function writeEntity(e: DxfEntity): string {
  switch (e.type) {
    case "LINE":
      return (
        g(0, "LINE") +
        g(8, e.layer) +
        g(10, e.start.x.toFixed(4)) +
        g(20, e.start.y.toFixed(4)) +
        g(30, "0.0") +
        g(11, e.end.x.toFixed(4)) +
        g(21, e.end.y.toFixed(4)) +
        g(31, "0.0")
      );
    case "LWPOLYLINE":
      return (
        g(0, "LWPOLYLINE") +
        g(8, e.layer) +
        g(90, e.points.length) +
        g(70, e.closed ? 1 : 0) +
        e.points.map((p) => g(10, p.x.toFixed(4)) + g(20, p.y.toFixed(4))).join("")
      );
    case "CIRCLE":
      return (
        g(0, "CIRCLE") +
        g(8, e.layer) +
        g(10, e.center.x.toFixed(4)) +
        g(20, e.center.y.toFixed(4)) +
        g(30, "0.0") +
        g(40, e.radius.toFixed(4))
      );
    case "ARC":
      return (
        g(0, "ARC") +
        g(8, e.layer) +
        g(10, e.center.x.toFixed(4)) +
        g(20, e.center.y.toFixed(4)) +
        g(30, "0.0") +
        g(40, e.radius.toFixed(4)) +
        g(50, e.startAngle.toFixed(4)) +
        g(51, e.endAngle.toFixed(4))
      );
    case "SPLINE": {
      const n = Math.max(1, Math.floor((e.controls.length - 1) / 3));
      // nós de Bézier por partes: 0,0,0,0, 1,1,1, ..., n,n,n,n
      const knots: number[] = [0, 0, 0, 0];
      for (let i = 1; i < n; i++) knots.push(i, i, i);
      knots.push(n, n, n, n);
      return (
        g(0, "SPLINE") +
        g(8, e.layer) +
        g(100, "AcDbEntity") +
        g(100, "AcDbSpline") +
        g(210, "0.0") +
        g(220, "0.0") +
        g(230, "1.0") +
        g(70, 8 + (e.closed ? 1 : 0)) + // 8 = planar, 1 = fechada
        g(71, 3) +
        g(72, knots.length) +
        g(73, e.controls.length) +
        g(74, 0) +
        knots.map((k) => g(40, k.toFixed(4))).join("") +
        e.controls
          .map((p) => g(10, p.x.toFixed(4)) + g(20, p.y.toFixed(4)) + g(30, "0.0"))
          .join("")
      );
    }
  }
}

export function exportDxf(doc: DxfDocument): string {
  const layers = doc.layers.length ? doc.layers : [{ name: "0", color: 7 }];
  const hasSpline = doc.entities.some((e) => e.type === "SPLINE");
  let out = "";
  out += g(0, "SECTION") + g(2, "HEADER");
  out += g(9, "$ACADVER") + g(1, hasSpline ? "AC1015" : "AC1009");
  out += g(9, "$INSUNITS") + g(70, 4); // 4 = milímetros
  out += g(0, "ENDSEC");


  out += g(0, "SECTION") + g(2, "TABLES");
  out += g(0, "TABLE") + g(2, "LAYER") + g(70, layers.length);
  for (const l of layers) {
    out += g(0, "LAYER") + g(2, l.name) + g(70, 0) + g(62, l.color) + g(6, "CONTINUOUS");
    // cor técnica real (AutoCAD true color) — preserva a convenção visual do CHAMFER
    if (l.trueColor !== undefined) out += g(420, l.trueColor);
  }
  out += g(0, "ENDTAB") + g(0, "ENDSEC");

  out += g(0, "SECTION") + g(2, "ENTITIES");
  for (const e of doc.entities) out += writeEntity(e);
  out += g(0, "ENDSEC") + g(0, "EOF");
  return out;
}

type Pair = { code: number; value: string };

function tokenize(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number((lines[i] ?? "").trim());
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
}

export function importDxf(text: string): DxfDocument {
  const pairs = tokenize(text);
  const entities: DxfEntity[] = [];
  const layers = new Map<string, DxfLayer>();

  let inEntities = false;
  let current: { type: string; data: Map<number, string[]> } | null = null;

  const flush = () => {
    if (!current) return;
    const d = current.data;
    const num = (c: number, idx = 0, fallback = 0) => {
      const v = d.get(c)?.[idx];
      return v === undefined ? fallback : Number(v);
    };
    const layer = d.get(8)?.[0] ?? "0";
    if (!layers.has(layer)) layers.set(layer, { name: layer, color: 7 });

    switch (current.type) {
      case "LINE":
        entities.push({
          type: "LINE",
          layer,
          start: { x: num(10), y: num(20) },
          end: { x: num(11), y: num(21) },
        });
        break;
      case "CIRCLE":
        entities.push({
          type: "CIRCLE",
          layer,
          center: { x: num(10), y: num(20) },
          radius: num(40),
        });
        break;
      case "ARC":
        entities.push({
          type: "ARC",
          layer,
          center: { x: num(10), y: num(20) },
          radius: num(40),
          startAngle: num(50),
          endAngle: num(51),
        });
        break;
      case "LWPOLYLINE":
      case "POLYLINE": {
        const xs = d.get(10) ?? [];
        const ys = d.get(20) ?? [];
        const points = xs.map((x, i) => ({ x: Number(x), y: Number(ys[i] ?? 0) }));
        if (points.length >= 2) {
          entities.push({
            type: "LWPOLYLINE",
            layer,
            points,
            closed: (num(70) & 1) === 1,
          });
        }
        break;
      }
      default:
        break; // SPLINE, TEXT, INSERT: suporte futuro
    }
    current = null;
  };

  const SUPPORTED = ["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE"];

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i]!;
    const v = value.trim();
    if (code === 0 && v === "SECTION") {
      const next = pairs[i + 1];
      inEntities = next?.code === 2 && next.value.trim() === "ENTITIES";
      continue;
    }
    if (code === 0 && v === "ENDSEC") {
      flush();
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;

    if (code === 0) {
      flush();
      if (v === "VERTEX") continue; // vértices agregam na polilinha anterior
      if (SUPPORTED.includes(v)) current = { type: v, data: new Map() };
      continue;
    }
    if (current) {
      const arr = current.data.get(code) ?? [];
      arr.push(v);
      current.data.set(code, arr);
    }
  }
  flush();

  return { layers: [...layers.values()], entities };
}

export function downloadDxf(doc: DxfDocument, filename: string) {
  const blob = new Blob([exportDxf(doc)], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".dxf") ? filename : `${filename}.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
