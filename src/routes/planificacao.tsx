import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { MATERIALS } from "@/lib/projects/demo-data";
import { formatNumber, useSettings } from "@/lib/settings/SettingsProvider";
import { Metric, Panel, SectionLabel } from "@/components/chameleon/ui";
import { useMaterials } from "@/lib/materials/MaterialsProvider";
import { useProjects } from "@/lib/projects/store";
import { bomToNestParts, projectBom } from "@/lib/projects/bom";
import { nestParts } from "@/lib/nesting/nesting";
import { cn } from "@/lib/utils";

type Search = { projeto?: string | undefined };

export const Route = createFileRoute("/planificacao")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    projeto: typeof raw["projeto"] === "string" ? raw["projeto"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Planificação — CALDRA" },
      {
        name: "description",
        content:
          "Aproveitamento de chapa, cálculo de peso e distribuição de peças no formato comercial.",
      },
      { property: "og:title", content: "Planificação — CALDRA" },
      {
        property: "og:description",
        content: "Calcule aproveitamento de chapa, sobras e massa antes de cortar.",
      },
    ],
  }),
  component: PlanificacaoRouteComponent,
});

const SHEETS = [
  { label: "2000 × 1000", w: 2000, h: 1000 },
  { label: "2500 × 1200", w: 2500, h: 1200 },
  { label: "3000 × 1500", w: 3000, h: 1500 },
  { label: "6000 × 2000", w: 6000, h: 2000 },
];

function PlanificacaoRouteComponent() {
  const { projeto } = Route.useSearch();
  return <Planificacao initialProjectId={projeto} />;
}

export function Planificacao({
  embedded = false,
  initialProjectId,
  onValidateNesting,
}: {
  embedded?: boolean;
  initialProjectId?: string | undefined;
  onValidateNesting?: (summary: {
    perSheet: number;
    sheets: number;
    yieldPct: number;
    unitMassKg: number;
    totalMassKg: number;
  }) => void;
} = {}) {
  const [mode, setMode] = useState<"manual" | "projeto">(
    initialProjectId ? "projeto" : "manual",
  );

  return (
    <div className="space-y-4">
      {!embedded && (
        <header className="space-y-1">
          <p className="font-mono text-[10px] font-bold tracking-wider uppercase text-accent">
            ENGENHARIA DE CORTE &amp; APROVEITAMENTO DE CHAPA
          </p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Nesting &amp; Aproveitamento de Chapa CNC
          </h1>
          <p className="text-xs text-muted-foreground">
            Arranjo em Grade Retangular com Kerf (Guilhotina Retangular) · Cálculo de chapas, retalhos e massa.
          </p>
        </header>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 rounded-xl border border-line bg-card/60 p-1">
          {(
            [
              { id: "manual", label: "Peça Avulsa" },
              { id: "projeto", label: "Do Projeto / Trabalho Ativo" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors",
                mode === t.id
                  ? "bg-accent text-background font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          Método: Arranjo em Grade Retangular com Kerf
        </span>
      </div>

      {mode === "manual" ? (
        <ManualMode onValidateNesting={onValidateNesting} />
      ) : (
        <ProjectMode initialId={initialProjectId} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modo peça avulsa (comportamento original + validação p/ BOM)       */
/* ------------------------------------------------------------------ */

function ManualMode({
  onValidateNesting,
}: {
  onValidateNesting?: (summary: {
    perSheet: number;
    sheets: number;
    yieldPct: number;
    unitMassKg: number;
    totalMassKg: number;
  }) => void;
}) {
  const { precision } = useSettings();
  const [sheet, setSheet] = useState(SHEETS[2]!);
  const [pieceW, setPieceW] = useState(620);
  const [pieceH, setPieceH] = useState(430);
  const [quantity, setQuantity] = useState(12);
  const [kerf, setKerf] = useState(3);
  const [thickness, setThickness] = useState(3);
  const [material, setMaterial] = useState(MATERIALS[0]!);
  const [validated, setValidated] = useState(false);

  const plan = useMemo(() => {
    const w = pieceW + kerf;
    const h = pieceH + kerf;
    const cols = Math.max(0, Math.floor(sheet.w / w));
    const rows = Math.max(0, Math.floor(sheet.h / h));
    const perSheet = cols * rows;
    const sheets = perSheet > 0 ? Math.ceil(quantity / perSheet) : 0;
    const usedArea = quantity * pieceW * pieceH;
    const totalArea = sheets * sheet.w * sheet.h;
    const yieldPct = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    const unitMass = (pieceW * pieceH * thickness * material.density) / 1_000_000_000;
    const mass = unitMass * quantity;
    return { cols, rows, perSheet, sheets, yieldPct, unitMass, mass, usedArea, totalArea };
  }, [sheet, pieceW, pieceH, quantity, kerf, thickness, material]);

  const placed = Math.min(plan.perSheet, quantity);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Panel className="space-y-3 p-4">
        <SectionLabel>Parâmetros do Arranjo CNC</SectionLabel>
        <label className="block">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            Chapa comercial (mm)
          </span>
          <select
            value={sheet.label}
            onChange={(e) => {
              setSheet(SHEETS.find((s) => s.label === e.target.value)!);
              setValidated(false);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {SHEETS.map((s, idx) => (
              <option key={`${s.label}-${idx}`} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Largura da peça"
            value={pieceW}
            onChange={(v) => {
              setPieceW(v);
              setValidated(false);
            }}
          />
          <Field
            label="Altura da peça"
            value={pieceH}
            onChange={(v) => {
              setPieceH(v);
              setValidated(false);
            }}
          />
          <Field
            label="Quantidade"
            value={quantity}
            onChange={(v) => {
              setQuantity(v);
              setValidated(false);
            }}
            unit="un"
          />
          <Field
            label="Sangria (kerf)"
            value={kerf}
            onChange={(v) => {
              setKerf(v);
              setValidated(false);
            }}
          />
          <Field
            label="Espessura"
            value={thickness}
            onChange={(v) => {
              setThickness(v);
              setValidated(false);
            }}
          />
          <label className="block">
            <span className="font-mono text-[10px] text-muted-foreground uppercase">Material</span>
            <select
              value={material.name}
              onChange={(e) => {
                setMaterial(MATERIALS.find((m) => m.name === e.target.value)!);
                setValidated(false);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-background/50 px-2.5 py-2 text-sm outline-none focus:border-accent"
            >
              {MATERIALS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({m.density} kg/m³)
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setValidated(true);
            onValidateNesting?.({
              perSheet: plan.perSheet,
              sheets: plan.sheets,
              yieldPct: Number(plan.yieldPct.toFixed(2)),
              unitMassKg: Number(plan.unitMass.toFixed(3)),
              totalMassKg: Number(plan.mass.toFixed(2)),
            });
          }}
          className="mt-2 w-full rounded-xl bg-accent px-3.5 py-2.5 font-mono text-xs font-bold uppercase text-background shadow-sm hover:opacity-90 transition-opacity"
        >
          {validated
            ? "✓ Nesting Validado e Sincronizado com BOM / Custos"
            : "✓ Validar Nesting e Alimentar BOM / Custos"}
        </button>
      </Panel>

      <div className="space-y-4">
        <Panel className="p-4">
          <SectionLabel>Aproveitamento &amp; Massa Calculada</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label="Peças / Chapa" value={plan.perSheet} suffix="un" precision={0} />
            <Metric label="Chapas" value={plan.sheets} suffix="un" precision={0} />
            <Metric label="Aproveitamento" value={plan.yieldPct} suffix="%" precision={2} />
            <Metric label="Massa Unit." value={plan.unitMass} suffix="kg" precision={3} />
            <Metric label="Massa Total" value={plan.mass} suffix="kg" precision={precision} />
          </div>
          <p className="mt-2 font-mono text-[10px] tabular-nums text-muted-foreground">
            Grade {plan.cols} × {plan.rows} ({plan.perSheet} un/chapa) · Retalho{" "}
            {formatNumber(Math.max(0, 100 - plan.yieldPct), 2)}% · Área livre{" "}
            {formatNumber((plan.totalArea - plan.usedArea) / 1_000_000, 3)} m²
          </p>
        </Panel>

        <Panel className="p-4">
          <SectionLabel action={<Layers className="size-4 text-accent" />}>
            Prévia da chapa ({sheet.w} × {sheet.h} mm)
          </SectionLabel>
          <svg
            viewBox={`0 0 ${sheet.w} ${sheet.h}`}
            className="h-auto w-full rounded-lg border border-line bg-background/40"
            role="img"
            aria-label="Distribuição de peças na chapa"
          >
            {Array.from({ length: placed }).map((_, i) => {
              const col = i % Math.max(plan.cols, 1);
              const row = Math.floor(i / Math.max(plan.cols, 1));
              return (
                <rect
                  key={i}
                  x={col * (pieceW + kerf)}
                  y={row * (pieceH + kerf)}
                  width={pieceW}
                  height={pieceH}
                  fill="var(--accent)"
                  fillOpacity="0.14"
                  stroke="var(--accent)"
                  strokeWidth={sheet.w / 500}
                />
              );
            })}
            <rect
              x="0"
              y="0"
              width={sheet.w}
              height={sheet.h}
              fill="none"
              stroke="var(--border)"
              strokeWidth={sheet.w / 400}
            />
          </svg>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modo projeto — usa as peças reais do dossiê                         */
/* ------------------------------------------------------------------ */

function ProjectMode({ initialId }: { initialId?: string | undefined }) {
  const projects = useProjects();
  const { materials } = useMaterials();
  const [projectId, setProjectId] = useState(initialId ?? projects[0]?.id ?? "");
  const [sheet, setSheet] = useState(SHEETS[2]!);
  const [kerf, setKerf] = useState(3);
  const [margin, setMargin] = useState(10);
  const [groupKey, setGroupKey] = useState<string>("");

  const project = projects.find((p) => p.id === projectId) ?? null;
  const bom = useMemo(
    () => (project ? projectBom(project, materials) : null),
    [project, materials],
  );

  const group = bom?.groups.find((g) => g.key === groupKey) ?? bom?.groups[0] ?? null;

  const nest = useMemo(() => {
    if (!group) return null;
    const parts = bomToNestParts(group.lines);
    if (parts.length === 0) return null;
    return nestParts(parts, {
      sheetW: sheet.w,
      sheetH: sheet.h,
      gap: kerf,
      margin,
      rotate: true,
    });
  }, [group, sheet, kerf, margin]);

  if (projects.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <p className="t-subtitle">Nenhum projeto ainda.</p>
        <Link to="/projetos" className="t-caption mt-2 inline-block text-accent underline">
          Criar um projeto
        </Link>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Panel className="space-y-3 p-4">
        <SectionLabel>Projeto</SectionLabel>
        <label className="block">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">Dossiê</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setGroupKey("");
            }}
            className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            Material e espessura
          </span>
          <select
            value={group?.key ?? ""}
            onChange={(e) => setGroupKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            {(bom?.groups ?? []).map((g) => (
              <option key={g.key} value={g.key}>
                {g.material} · {g.thickness} mm ({g.quantity} un)
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            Chapa comercial (mm)
          </span>
          <select
            value={sheet.label}
            onChange={(e) => setSheet(SHEETS.find((s) => s.label === e.target.value)!)}
            className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            {SHEETS.map((s, idx) => (
              <option key={`${s.label}-${idx}`} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Sangria (kerf)" value={kerf} onChange={setKerf} />
          <Field label="Margem da chapa" value={margin} onChange={setMargin} />
        </div>

        {project && (
          <Link
            to="/projetos/$projectId"
            params={{ projectId: project.id }}
            className="t-caption inline-block text-accent underline"
          >
            Abrir o projeto
          </Link>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel className="p-4">
          <SectionLabel>Aproveitamento</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Peças" value={nest?.placed ?? 0} suffix="un" precision={0} />
            <Metric label="Chapas" value={nest?.sheets.length ?? 0} suffix="un" precision={0} />
            <Metric
              label="Aproveitamento"
              value={(nest?.utilization ?? 0) * 100}
              suffix="%"
              precision={1}
            />
            <Metric label="Massa do lote" value={group?.massKg ?? 0} suffix="kg" precision={2} />
          </div>
          {nest && nest.rejected.length > 0 && (
            <p className="t-caption mt-2">
              {nest.rejected.length} peça(s) maior(es) que a chapa escolhida.
            </p>
          )}
          {bom && bom.pending > 0 && (
            <p className="t-caption mt-1">
              {bom.pending} peça(s) sem medida ainda — confirme os parâmetros na Traçagem.
            </p>
          )}
        </Panel>

        {nest ? (
          nest.sheets.map((s, i) => (
            <Panel key={i} className="p-4">
              <SectionLabel action={<Layers className="size-4 text-accent" />}>
                Chapa {i + 1} de {nest.sheets.length}
              </SectionLabel>
              <svg
                viewBox={`0 0 ${sheet.w} ${sheet.h}`}
                className="h-auto w-full rounded-lg border border-line bg-background/40"
                role="img"
                aria-label={`Distribuição de peças na chapa ${i + 1}`}
              >
                {s.placements.map((p, k) => (
                  <g key={k}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      fill="var(--accent)"
                      fillOpacity="0.14"
                      stroke="var(--accent)"
                      strokeWidth={sheet.w / 600}
                    />
                    <text
                      x={p.x + p.w / 2}
                      y={p.y + p.h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--accent)"
                      fontSize={Math.max(18, sheet.w / 90)}
                    >
                      {p.name.split(" · ")[0]}
                    </text>
                  </g>
                ))}
                <rect
                  x="0"
                  y="0"
                  width={sheet.w}
                  height={sheet.h}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={sheet.w / 400}
                />
              </svg>
            </Panel>
          ))
        ) : (
          <Panel className="p-8 text-center">
            <p className="t-subtitle">Sem peças com medida para aninhar.</p>
            <p className="t-caption mt-1">
              Adicione peças ao projeto e confirme os parâmetros para ver o plano de chapa.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  unit = "mm",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className="mt-1 flex items-center overflow-hidden rounded-lg border border-line bg-background/50 focus-within:border-accent">
        <input
          inputMode="decimal"
          value={String(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="w-full min-w-0 bg-transparent px-2.5 py-2.5 font-mono text-sm outline-none"
        />
        <span className="border-l border-line px-2 font-mono text-[10px] text-muted-foreground">
          {unit}
        </span>
      </span>
    </label>
  );
}
