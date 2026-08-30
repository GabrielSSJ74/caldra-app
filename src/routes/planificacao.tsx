import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { MATERIALS } from "@/lib/projects/demo-data";
import { formatNumber, useSettings } from "@/lib/settings/SettingsProvider";
import { Metric, Panel, SectionLabel } from "@/components/chameleon/ui";

export const Route = createFileRoute("/planificacao")({
  head: () => ({
    meta: [
      { title: "Planificação — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content:
          "Aproveitamento de chapa, cálculo de peso e distribuição de peças no formato comercial.",
      },
      { property: "og:title", content: "Planificação — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Calcule aproveitamento de chapa, sobras e massa antes de cortar.",
      },
    ],
  }),
  component: Planificacao,
});

const SHEETS = [
  { label: "2000 × 1000", w: 2000, h: 1000 },
  { label: "2500 × 1200", w: 2500, h: 1200 },
  { label: "3000 × 1500", w: 3000, h: 1500 },
  { label: "6000 × 2000", w: 6000, h: 2000 },
];

function Planificacao() {
  const { precision } = useSettings();
  const [sheet, setSheet] = useState(SHEETS[2]!);
  const [pieceW, setPieceW] = useState(620);
  const [pieceH, setPieceH] = useState(430);
  const [quantity, setQuantity] = useState(12);
  const [kerf, setKerf] = useState(3);
  const [thickness, setThickness] = useState(3);
  const [material, setMaterial] = useState(MATERIALS[0]!);

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
    const mass = (usedArea * thickness * material.density) / 1_000_000_000;
    return { cols, rows, perSheet, sheets, yieldPct, mass, usedArea, totalArea };
  }, [sheet, pieceW, pieceH, quantity, kerf, thickness, material]);

  const placed = Math.min(plan.perSheet, quantity);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Planificação</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Distribua as peças desenvolvidas na chapa comercial e antecipe consumo, sobra e peso.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel className="space-y-3 p-4">
          <SectionLabel>Parâmetros</SectionLabel>
          <label className="block">
            <span className="font-mono text-[10px] text-muted-foreground uppercase">
              Chapa comercial (mm)
            </span>
            <select
              value={sheet.label}
              onChange={(e) => setSheet(SHEETS.find((s) => s.label === e.target.value)!)}
              className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {SHEETS.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Largura da peça" value={pieceW} onChange={setPieceW} />
            <Field label="Altura da peça" value={pieceH} onChange={setPieceH} />
            <Field label="Quantidade" value={quantity} onChange={setQuantity} unit="un" />
            <Field label="Sangria (kerf)" value={kerf} onChange={setKerf} />
            <Field label="Espessura" value={thickness} onChange={setThickness} />
            <label className="block">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                Material
              </span>
              <select
                value={material.name}
                onChange={(e) => setMaterial(MATERIALS.find((m) => m.name === e.target.value)!)}
                className="mt-1 w-full rounded-lg border border-line bg-background/50 px-2.5 py-2.5 text-sm outline-none focus:border-accent"
              >
                {MATERIALS.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Aproveitamento</SectionLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Peças por chapa" value={plan.perSheet} suffix="un" precision={0} />
              <Metric label="Chapas" value={plan.sheets} suffix="un" precision={0} />
              <Metric label="Aproveitamento" value={plan.yieldPct} suffix="%" precision={1} />
              <Metric label="Massa total" value={plan.mass} suffix="kg" precision={precision} />
            </div>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Grade {plan.cols} × {plan.rows} · sobra{" "}
              {formatNumber((plan.totalArea - plan.usedArea) / 1_000_000, 3)} m²
            </p>
          </Panel>

          <Panel className="p-4">
            <SectionLabel action={<Layers className="size-4 text-accent" />}>
              Prévia da chapa
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
