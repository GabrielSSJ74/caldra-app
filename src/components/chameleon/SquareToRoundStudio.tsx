import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Download, FileText, Image as ImageIcon, Lightbulb } from "lucide-react";
import {
  SQUARE_TO_ROUND_DEFAULTS,
  calculateSquareToRound,
  validateSquareToRound,
  type SquareToRoundInput,
} from "@/lib/geometry/squareToRound";
import { downloadDxf, type DxfEntity } from "@/lib/dxf/dxfService";
import { exportSvgAsPdf, exportSvgAsPng } from "@/lib/export/exporters";
import { MATERIALS } from "@/lib/projects/demo-data";
import { formatNumber, useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";
import { DevelopmentView } from "./DevelopmentView";
import { SchematicSquareToRound } from "./SchematicSquareToRound";
import { Metric, Panel, SectionLabel } from "./ui";

type FieldKey = keyof SquareToRoundInput;

const FIELDS: { key: FieldKey; label: string; tag: string; step?: number }[] = [
  { key: "baseA", label: "Lado A da base", tag: "A" },
  { key: "baseB", label: "Lado B da base", tag: "B" },
  { key: "topDiameter", label: "Diâmetro do topo", tag: "ØD" },
  { key: "height", label: "Altura vertical", tag: "H" },
  { key: "offsetX", label: "Excentricidade X", tag: "ex" },
  { key: "offsetY", label: "Excentricidade Y", tag: "ey" },
];

const TABS = [
  "Dimensões",
  "Cálculos",
  "Traçado",
  "Desenvolvimento",
  "Material",
  "Exportação",
] as const;
type Tab = (typeof TABS)[number];

export function SquareToRoundStudio() {
  const { can } = useFeatureAccess();
  const { precision } = useSettings();
  const [input, setInput] = useState<SquareToRoundInput>(SQUARE_TO_ROUND_DEFAULTS);
  const [material, setMaterial] = useState(MATERIALS[0]!.name);
  const [focused, setFocused] = useState<FieldKey | null>(null);
  const [calculated, setCalculated] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [tab, setTab] = useState<Tab>("Dimensões");
  const [explain, setExplain] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const issues = useMemo(() => validateSquareToRound(input), [input]);
  const result = useMemo(() => {
    if (issues.length) return null;
    try {
      return calculateSquareToRound(input);
    } catch {
      return null;
    }
  }, [input, issues]);

  const set = (key: FieldKey, raw: string) => {
    const value = raw === "" || raw === "-" ? 0 : Number(raw.replace(",", "."));
    if (Number.isNaN(value)) return;
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const run = () => {
    if (issues.length) {
      toast.error(issues[0]!.message);
      return;
    }
    setCalculating(true);
    setTimeout(() => {
      setCalculating(false);
      setCalculated(true);
      setTab("Dimensões");
      toast.success("Desenvolvimento calculado.");
    }, 420);
  };

  const issueFor = (key: FieldKey) => issues.find((i) => i.field === key)?.message;

  const exportPng = async () => {
    if (!svgRef.current) return;
    await exportSvgAsPng(svgRef.current, "chameleon-quadrado-redondo");
    toast.success("PNG exportado.");
  };

  const exportPdf = () => {
    if (!svgRef.current || !result) return;
    exportSvgAsPdf(
      svgRef.current,
      {
        pieceName: "Transição Quadrado → Redondo",
        project: "Laboratório Chameleon",
        material,
        thickness: `${input.thickness} mm`,
        quantity: "1",
        notes: result.warnings.join(" "),
      },
      result.metrics.map((m) => [
        m.label,
        `${formatNumber(m.value, precision)} ${m.suffix ?? "mm"}`,
      ]),
    );
  };

  const exportDxfFile = () => {
    if (!result) return;
    const entities: DxfEntity[] = [
      {
        type: "LWPOLYLINE",
        layer: "CORTE",
        closed: true,
        points: result.development.outline.map((p) => ({ x: p.x, y: p.y })),
      },
      ...result.development.foldLines.map<DxfEntity>((s) => ({
        type: "LINE",
        layer: "DOBRA",
        start: s.a,
        end: s.b,
      })),
    ];
    downloadDxf(
      {
        layers: [
          { name: "CORTE", color: 1 },
          { name: "DOBRA", color: 3 },
        ],
        entities,
      },
      "chameleon-quadrado-redondo",
    );
    toast.success("DXF exportado.");
  };

  return (
    <div className="space-y-4">
      {/* MEDIDAS */}
      <Panel className="p-3.5 lg:p-5" glow>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="grid-bg relative min-h-[220px] overflow-hidden rounded-xl border border-line bg-background/40 lg:min-h-[300px]">
            <SchematicSquareToRound input={input} highlight={focused} />
            <span className="absolute top-2 left-2.5 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
              Esquema · mm
            </span>
          </div>

          <div>
            <SectionLabel>Medidas</SectionLabel>
            <p className="mb-3 text-xs text-muted-foreground">
              Defina as dimensões da peça. O desenho acompanha cada alteração.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {FIELDS.map((f) => {
                const err = issueFor(f.key);
                return (
                  <label key={f.key} className="block">
                    <span className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{f.label}</span>
                      <span className="text-accent/80">{f.tag}</span>
                    </span>
                    <span
                      className={cn(
                        "flex items-center overflow-hidden rounded-lg border bg-background/50 transition-colors",
                        err ? "border-destructive" : "border-line focus-within:border-accent",
                      )}
                    >
                      <input
                        inputMode="decimal"
                        value={String(input[f.key])}
                        onChange={(e) => set(f.key, e.target.value)}
                        onFocus={() => setFocused(f.key)}
                        onBlur={() => setFocused(null)}
                        className="w-full min-w-0 bg-transparent px-2.5 py-2.5 font-mono text-[15px] outline-none"
                      />
                      <span className="border-l border-line px-2 font-mono text-[10px] text-muted-foreground">
                        mm
                      </span>
                    </span>
                    {err && <span className="mt-1 block text-[10px] text-destructive">{err}</span>}
                  </label>
                );
              })}
            </div>

            {/* MÉTODO */}
            <div className="mt-3 rounded-xl border border-line bg-background/40 p-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Método
              </p>
              <p className="mt-1 text-sm">Triangulação · comprimentos verdadeiros</p>
              <label className="mt-2 flex items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Divisões por quadrante
                </span>
                <input
                  type="range"
                  min={3}
                  max={24}
                  value={input.divisions}
                  onChange={(e) => set("divisions", e.target.value)}
                  className="h-1 flex-1 accent-[var(--accent)]"
                />
                <span className="w-8 text-right font-mono text-xs">{input.divisions}</span>
              </label>
            </div>

            <button
              onClick={run}
              disabled={calculating}
              className="brand-gradient mt-3 w-full rounded-xl py-3 font-display text-sm font-semibold text-background transition-transform active:scale-[0.99] disabled:opacity-70"
            >
              {calculating ? "Calculando…" : "Gerar desenvolvimento"}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Confira os parâmetros antes de gerar o desenvolvimento.
            </p>
          </div>
        </div>
      </Panel>

      {/* RESULTADO */}
      {calculating && (
        <Panel className="space-y-2 p-4">
          <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />
        </Panel>
      )}

      {calculated && result && !calculating && (
        <Panel className="fade-up p-3.5 lg:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Resultado</SectionLabel>
            <span className="flex items-center gap-1 font-mono text-[10px] text-accent">
              <Check className="size-3" /> Desenvolvimento calculado
            </span>
          </div>

          <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
                  tab === t
                    ? "bg-accent/12 text-accent ring-1 ring-accent/20"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div key={tab} className="fade-up">
            {tab === "Dimensões" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {result.metrics.map((m) => (
                  <Metric
                    key={m.label}
                    label={m.label}
                    value={m.value}
                    suffix={m.suffix ?? "mm"}
                    precision={m.suffix === "un" ? 0 : precision}
                  />
                ))}
              </div>
            )}

            {tab === "Cálculos" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-line bg-background/40 p-3">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase">Método</p>
                  <p className="mt-1 text-sm">{result.method}</p>
                </div>
                <div className="max-h-64 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground">
                        <th className="px-3 py-2 font-normal">Geratriz</th>
                        <th className="px-3 py-2 text-right font-normal">
                          Comprimento verdadeiro (mm)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trueLengths.map((t) => (
                        <tr key={t.id} className="border-t border-line">
                          <td className="px-3 py-1.5">{t.id}</td>
                          <td className="px-3 py-1.5 text-right">
                            {formatNumber(t.length, precision)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.warnings.map((w) => (
                  <p key={w} className="text-[11px] text-warn">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {(tab === "Traçado" || tab === "Desenvolvimento") && (
              <div className="grid-bg-fine rounded-xl border border-line bg-background/40 p-3">
                <div className="h-[300px] lg:h-[420px]">
                  <DevelopmentView
                    ref={svgRef}
                    pattern={result.development}
                    showFolds={tab === "Traçado"}
                    showPoints={tab === "Traçado"}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {tab === "Traçado"
                    ? "Linhas de corte (contorno) · geratrizes tracejadas · pontos V0–V3 da base."
                    : "Contorno de corte pronto para nesting. Escala real em milímetros."}
                </p>
              </div>
            )}

            {tab === "Material" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">
                    Material
                  </span>
                  <select
                    value={material}
                    onChange={(e) => {
                      const m = MATERIALS.find((x) => x.name === e.target.value)!;
                      setMaterial(m.name);
                      setInput((p) => ({ ...p, density: m.density }));
                    }}
                    className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
                  >
                    {MATERIALS.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">
                    Espessura (mm)
                  </span>
                  <input
                    inputMode="decimal"
                    value={String(input.thickness)}
                    onChange={(e) => set("thickness", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 font-mono text-sm outline-none focus:border-accent"
                  />
                </label>
                <Metric
                  label="Área desenvolvida"
                  value={result.areaMm2 / 1_000_000}
                  suffix="m²"
                  precision={4}
                />
                <Metric
                  label="Massa estimada"
                  value={(result.areaMm2 * input.thickness * input.density) / 1_000_000_000}
                  suffix="kg"
                  precision={precision}
                />
              </div>
            )}

            {tab === "Exportação" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={exportPng}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 py-2.5 font-mono text-[11px] transition-colors hover:bg-secondary"
                  >
                    <ImageIcon className="size-3.5" /> PNG
                  </button>
                  <button
                    onClick={() => (can("export.pdf") ? exportPdf() : toast.error("Exportação PDF disponível no Modo Mestre."))}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 font-mono text-[11px] transition-colors",
                      can("export.pdf")
                        ? "border-border bg-secondary/40 hover:bg-secondary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <FileText className="size-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => (can("export.dxf") ? exportDxfFile() : toast.error("Exportação DXF disponível no Modo Mestre."))}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 font-mono text-[11px] transition-colors",
                      can("export.dxf")
                        ? "border-accent/25 bg-accent/10 text-accent"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <Download className="size-3.5" /> DXF
                  </button>
                </div>
                <div className="hidden">
                  <DevelopmentView ref={svgRef} pattern={result.development} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  PNG em alta resolução · PDF com folha técnica · DXF em milímetros com camadas
                  CORTE e DOBRA.
                </p>
              </div>
            )}
          </div>

          {/* ENTENDER O CÁLCULO */}
          <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
            <button
              onClick={() =>
                can("calc.explanation")
                  ? setExplain((v) => !v)
                  : toast.error("Explicação passo a passo disponível no Modo Mestre.")
              }
              className="flex w-full items-center gap-2 text-left"
            >
              <Lightbulb className="size-4 shrink-0 text-accent" />
              <span className="font-mono text-[10px] tracking-wider text-accent uppercase">
                Entender o cálculo
              </span>
              <ChevronRight
                className={cn(
                  "ml-auto size-4 text-accent transition-transform",
                  explain && "rotate-90",
                )}
              />
            </button>
            {explain && can("calc.explanation") && (
              <div className="fade-up mt-3 space-y-3">
                {result.steps.map((s) => (
                  <div key={s.title} className="rounded-lg border border-line bg-background/40 p-3">
                    <p className="text-[12px] font-medium">{s.title}</p>
                    <div className="mt-2 space-y-1 font-mono text-[11px]">
                      <Row k="Dado" v={s.given} />
                      <Row k="Fórmula" v={s.formula} />
                      <Row k="Subst." v={s.substitution} muted />
                      <Row k="Resultado" v={s.result} accent />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">{s.meaning}</p>
                  </div>
                ))}
              </div>
            )}
            {!can("calc.explanation") && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No Modo Mestre, cada medida é explicada passo a passo: dado, fórmula, substituição,
                resultado e interpretação geométrica.
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Row({ k, v, muted, accent }: { k: string; v: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
      <span className={cn(accent && "text-accent", muted && "text-foreground/70")}>{v}</span>
    </div>
  );
}
