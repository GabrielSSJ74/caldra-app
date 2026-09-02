import { SchematicViews } from "./SchematicViews";
import type { WireParams } from "@/lib/viz3d/wire";
import { cn } from "@/lib/utils";

export type CotaSpec = {
  /** Campo do motor de cálculo. */
  field: string;
  /** Cota correspondente nas vistas. */
  dim: keyof WireParams | null;
  label: string;
  value: number;
  unit?: string;
};

/** Posição da etiqueta de cota conforme a grandeza representada. */
function place(dim: CotaSpec["dim"], i: number): React.CSSProperties {
  switch (dim) {
    case "h":
      return { left: "2%", top: "44%" };
    case "d1":
      return { left: "6%", bottom: "22%" };
    case "d2":
      return { left: "6%", top: "8%" };
    case "e":
      return { left: "34%", top: "4%" };
    default:
      return { right: "3%", top: `${8 + i * 13}%` };
  }
}

/**
 * Diagrama paramétrico unificado: peça + cotas visuais interativas.
 * Tocar numa cota ativa o campo correspondente; o desenho reage em tempo real.
 */
export function ParametricDiagram({
  slug,
  params,
  cotas,
  active,
  pulse,
  onPick,
  className,
}: {
  slug: string;
  params: WireParams;
  cotas: CotaSpec[];
  active?: string | null;
  pulse?: string | null;
  onPick: (field: string) => void;
  className?: string;
}) {
  const highlight = cotas.find((c) => c.field === active)?.dim ?? null;

  return (
    <div className={cn("relative size-full", className)}>
      <SchematicViews slug={slug} params={params} highlight={highlight} />
      {cotas.map((c, i) => (
        <button
          key={c.field}
          type="button"
          onClick={() => onPick(c.field)}
          style={place(c.dim, i)}
          className={cn(
            "absolute rounded-full border px-2 py-1 font-mono text-[10px] whitespace-nowrap backdrop-blur-sm transition-all duration-300",
            active === c.field || pulse === c.field
              ? "border-accent/50 bg-accent/15 text-accent shadow-[0_0_14px_-2px_var(--accent)]"
              : "border-line bg-background/70 text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label} {Number(c.value.toFixed(2))}
          <span className="opacity-60"> {c.unit ?? "mm"}</span>
        </button>
      ))}
    </div>
  );
}
