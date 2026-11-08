import { useMemo, useState } from "react";
import { Cloud, Eye, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMaterials } from "@/lib/materials/MaterialsProvider";
import type { Material } from "@/lib/materials/types";
import { DEFAULT_THICKNESSES } from "@/lib/materials/types";
import { Panel } from "./ui";
import { cn } from "@/lib/utils";

type CategoryFilter = "todas" | "chapas" | "ligas" | "custom";

/** MEUS MATERIAIS & LIGAS — CRUD offline-first (IndexedDB) com barra compacta inline e alta densidade. */
export function MaterialManager({ onOpenBackup }: { onOpenBackup?: () => void } = {}) {
  const { materials, ready, upsert, remove, create, lossPct, setLossPct } = useMaterials();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todas");

  const add = async () => {
    const m = await create();
    setOpenId(m.id);
    toast.success("Novo material adicionado ao catálogo local.");
  };

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (categoryFilter === "chapas" && !m.builtIn) return false;
      if (categoryFilter === "ligas" && m.density < 3000 && !m.name.toLowerCase().includes("alum"))
        return false;
      if (categoryFilter === "custom" && m.builtIn) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.note && m.note.toLowerCase().includes(q)) ||
        String(m.density).includes(q)
      );
    });
  }, [materials, search, categoryFilter]);

  const handleExportBackupJson = () => {
    if (onOpenBackup) {
      onOpenBackup();
      return;
    }
    const payload = JSON.stringify({ lossPct, materials, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "caldra_materiais_ligas_backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup de Materiais & Ligas exportado com sucesso!");
  };

  return (
    <Panel className="space-y-3.5 p-4">
      {/* Cabeçalho Compacto Inline */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line pb-3">
        <div>
          <h3 className="font-display text-sm font-bold text-foreground">
            Catálogo de Materiais, Chapas &amp; Ligas Metálicas
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Base offline-first sincronizada com Nesting CNC, BOM e Custos. Padrões de fábrica editáveis e ocultáveis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Perda Padrão Inline */}
          <label className="flex items-center gap-2 rounded-xl border border-line bg-background/60 px-2.5 py-1.5">
            <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground whitespace-nowrap">
              Perda Padrão de Corte (%)
            </span>
            <input
              inputMode="decimal"
              aria-label="Perda Padrão de Corte (%)"
              value={String(lossPct)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (Number.isFinite(n) && n >= 0) setLossPct(n);
              }}
              className="w-12 rounded-md border border-line bg-card px-2 py-0.5 text-center font-mono text-xs font-bold tabular-nums text-accent outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={() => void add()}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-background hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Novo Material
          </button>

          <button
            type="button"
            onClick={handleExportBackupJson}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-background/60 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase text-foreground hover:border-accent transition-colors whitespace-nowrap"
          >
            <Cloud className="size-3.5 text-accent" /> Backup / Nuvem
          </button>
        </div>
      </div>

      {/* Barra de Busca e Filtro de Categoria */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar liga (Aço Carbono, Inox 304, Alumínio, Galvanizado, Latão)..."
            className="w-full rounded-xl border border-line bg-background/50 py-1.5 pr-3 pl-8 text-xs text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-line bg-background/40 p-1">
          {(
            [
              { id: "todas", label: "Todas" },
              { id: "chapas", label: "Chapas & Padrões" },
              { id: "ligas", label: "Ligas Especiais" },
              { id: "custom", label: "Customizados" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategoryFilter(f.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold uppercase transition-colors whitespace-nowrap",
                categoryFilter === f.id
                  ? "bg-accent text-background font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!ready && <p className="font-mono text-[10px] text-muted-foreground">Carregando base de materiais…</p>}

      {/* Lista Compacta de Alta Densidade */}
      <div className="grid gap-2 sm:grid-cols-2">
        {filteredMaterials.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-xl border border-line bg-background/40 p-3 transition-colors hover:border-accent/40",
              m.hidden && "opacity-55",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {m.name}
                  </p>
                  <span className="font-mono text-[9.5px] text-muted-foreground">
                    {m.builtIn ? "· Liga Padrão NBR" : "· Personalizado"}
                  </span>
                </div>

                {/* Diferenciação explícita: Cadastro Técnico · Preço de Referência · Estoque */}
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg border border-line/70 bg-card/50 px-2.5 py-1.5 font-mono text-[10px] tabular-nums">
                  <div>
                    <span className="block text-[8.5px] uppercase text-muted-foreground">
                      Densidade
                    </span>
                    <strong className="text-foreground">{m.density} kg/m³</strong>
                  </div>
                  <div>
                    <span className="block text-[8.5px] uppercase text-muted-foreground">
                      Preço Ref.
                    </span>
                    <strong className="text-accent">R$ {m.pricePerKg.toFixed(2)}/kg</strong>
                  </div>
                  <div>
                    <span className="block text-[8.5px] uppercase text-muted-foreground">
                      Espessuras
                    </span>
                    <strong className="text-foreground">{m.thicknesses.length} bitolas</strong>
                  </div>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={m.hidden ? `Mostrar ${m.name}` : `Ocultar ${m.name}`}
                  onClick={() => void upsert({ ...m, hidden: !m.hidden })}
                  className="rounded-lg border border-line p-2 text-muted-foreground hover:text-foreground"
                >
                  {m.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                {!m.builtIn && (
                  <button
                    type="button"
                    aria-label={`Excluir ${m.name}`}
                    onClick={() => {
                      void remove(m.id);
                      toast.success("Material excluído.");
                    }}
                    className="rounded-lg border border-destructive/40 p-2 text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {openId === m.id && <Editor material={m} onSave={(next) => void upsert(next)} />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Editor({ material, onSave }: { material: Material; onSave: (m: Material) => void }) {
  const [draft, setDraft] = useState<Material>(material);
  const [thick, setThick] = useState(draft.thicknesses.join(" / "));

  const commit = (next: Material) => {
    setDraft(next);
    onSave(next);
  };

  return (
    <div className="mt-3 space-y-2.5 border-t border-line pt-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Text label="Nome" value={draft.name} onChange={(v) => commit({ ...draft, name: v })} />
        <Num
          label="Densidade (kg/m³)"
          value={draft.density}
          onChange={(v) => commit({ ...draft, density: v })}
        />
        <Num
          label="Preço de Referência (R$/kg)"
          value={draft.pricePerKg}
          onChange={(v) => commit({ ...draft, pricePerKg: v })}
        />
        <Text
          label="Estoque / Observação"
          value={draft.note ?? ""}
          onChange={(v) => commit({ ...draft, note: v })}
        />
      </div>
      <label className="block">
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          Espessuras comerciais (mm, separadas por / )
        </span>
        <input
          value={thick}
          onChange={(e) => setThick(e.target.value)}
          onBlur={() => {
            const list = thick
              .split(/[/,;]/)
              .map((s) => Number(s.trim().replace(",", ".")))
              .filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => a - b);
            const next = list.length ? list : DEFAULT_THICKNESSES;
            setThick(next.join(" / "));
            commit({ ...draft, thicknesses: next });
          }}
          className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-muted-foreground uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2 text-xs outline-none focus:border-accent"
      />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-muted-foreground uppercase">{label}</span>
      <input
        inputMode="decimal"
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="mt-1 w-full rounded-lg border border-line bg-background/50 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />
    </label>
  );
}
