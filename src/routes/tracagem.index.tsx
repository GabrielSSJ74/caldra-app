import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Heart, Lock, Search, Star, Trash2, User } from "lucide-react";
import {
  CATEGORY_LABEL,
  PART_REGISTRY,
  findPart,
  partHref,
  type PartCategory,
  type PartModel,
} from "@/lib/library/registry";
import { searchParts } from "@/lib/library/search";
import {
  markRecent,
  removeCustom,
  toggleFavorite,
  useLibraryState,
  type CustomModel,
} from "@/lib/library/store";
import { getGenerator, defaultValues } from "@/lib/cnc2d/generators";
import { VectorPreview } from "@/components/chameleon/VectorPreview";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveEffectiveThemeId } from "@/lib/settings/themeTransitionEngine";
import { NavigationAreaHeader } from "@/components/ui/NavigationAreaHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracagem/")({
  head: () => ({
    meta: [
      { title: "Traçagem — Biblioteca de peças CALDRA" },
      {
        name: "description",
        content:
          "Biblioteca profissional de caldeiraria, tubulações e CNC 2D: transições, cones, curvas de gomos, interseções, flanges e geometria vetorial para fabricação.",
      },
      { property: "og:title", content: "Traçagem — Biblioteca de peças CALDRA" },
      {
        property: "og:description",
        content: "Encontre a peça e siga direto para 3D, planificação ou CHAMFER.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TracagemIndex,
});

type Tab = "todas" | PartCategory | "estruturas";
type Shortcut = "recentes" | "favoritos" | "meus" | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "todas", label: "TODOS" },
  { id: "caldeiraria", label: "CALDEIRARIA" },
  { id: "tubulacoes", label: "TUBULAÇÕES" },
  { id: "cnc2d", label: "CNC 2D" },
  { id: "estruturas", label: "ESTRUTURAS" },
];

const STRUCTURAL_FAMILIES = new Set(["Suportes", "Flanges", "Flanges CNC", "Chapas", "Conexões"]);

/** Retorna o rótulo matemático enxuto para a pílula superior esquerda do cartão */
function resolvePartMethodBadge(part: PartModel): string {
  const rawSpec = (part.specs[0] ?? "").toLowerCase();
  const slug = part.engineSlug ?? "";

  if (
    slug === "quadrado-redondo" ||
    slug === "redondo-quadrado" ||
    slug === "cone-excentrico" ||
    slug === "transicoes" ||
    rawSpec.includes("triangula") ||
    part.tags.includes("triangulação")
  ) {
    return "TRIANGULAÇÃO";
  }

  if (
    slug === "cone" ||
    slug === "tronco-de-cone" ||
    slug === "reducao-circular" ||
    rawSpec.includes("radial") ||
    part.tags.includes("radial")
  ) {
    return "RADIAL";
  }

  if (
    slug === "boca-de-lobo" ||
    slug === "te" ||
    slug === "y" ||
    slug === "interseccoes" ||
    part.family === "Interseções" ||
    rawSpec.includes("interse")
  ) {
    return "INTERSEÇÃO";
  }

  if (
    slug === "cilindro" ||
    slug === "dutos" ||
    slug === "chamines" ||
    slug === "curva-de-gomos" ||
    rawSpec.includes("direto") ||
    rawSpec.includes("perímetro") ||
    rawSpec.includes("oblíquas")
  ) {
    return "PARALELAS";
  }

  if (slug === "flanges" || rawSpec.includes("angular")) {
    return "RADIAL";
  }

  if (slug === "calotas" || slug === "tampas") {
    return "RADIAL";
  }

  if (part.kind === "vector") {
    return "CNC 2D";
  }

  return (part.specs[0] ?? "PARAMÉTRICO").toUpperCase();
}

function TracagemIndex() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("todas");
  const [shortcut, setShortcut] = useState<Shortcut>(null);
  const { favorites, recents, custom } = useLibraryState();
  const { theme } = useSettings();
  const effectiveTheme = resolveEffectiveThemeId(theme);

  const parts = useMemo(() => {
    let list = PART_REGISTRY;
    if (tab === "estruturas") {
      list = list.filter((p) => STRUCTURAL_FAMILIES.has(p.family));
    } else if (tab !== "todas") {
      list = list.filter((p) => p.category === tab);
    }
    if (shortcut === "favoritos") list = list.filter((p) => favorites.includes(p.id));
    if (shortcut === "recentes")
      list = recents
        .map((id) => findPart(id))
        .filter((p): p is PartModel => !!p && list.includes(p));
    return searchParts(list, query);
  }, [tab, shortcut, favorites, recents, query]);

  const showCustom = shortcut === "meus";

  return (
    <div className="space-y-3 pb-[120px]" style={{ paddingBottom: "120px" }}>
      <NavigationAreaHeader
        badgeText="BIBLIOTECA & MODELOS PARAMÉTRICOS"
        badgeColor="text-sky-500"
        indicatorColor="bg-sky-500"
        secondaryBadge={
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-sky-400 border border-sky-500/30">
            {PART_REGISTRY.length} MODELOS
          </span>
        }
        title="Traçagem Paramétrica"
      />

      {/* 1. Campo de busca */}
      <label className="metal flex min-w-0 items-center gap-2.5 rounded-full px-4 border border-white/[0.08] focus-within:border-blue-500/60 transition-colors">
        <Search className="size-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar peça"
          placeholder="Buscar peça, tubo, flange, suporte..."
          className="w-full bg-transparent py-2.5 text-[13px] text-foreground outline-none placeholder:text-slate-400/75"
        />
      </label>

      {/* 2. Barra principal de categorias (TODOS | CALDEIRARIA | TUBULAÇÕES | CNC 2D | ESTRUTURAS) */}
      <div
        role="tablist"
        aria-label="Categorias da biblioteca"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              style={
                isActive
                  ? {
                      background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                      color: "#FFFFFF",
                      boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                    }
                  : undefined
              }
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-mono text-[10.5px] tracking-[0.12em] uppercase transition-all cursor-pointer",
                isActive
                  ? "font-bold text-white border border-blue-400/40"
                  : "font-medium text-slate-600 dark:text-slate-300/85 hover:text-slate-900 dark:hover:text-white bg-slate-200/55 dark:bg-slate-900/55 border border-slate-300/60 dark:border-white/[0.07]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 3. Linha de filtros rápidos (RECENTES | FAVORITOS | MEUS MODELOS) alinhada e sem espaço vazio */}
      <div
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden"
      >
        <Chip
          icon={Clock}
          label="Recentes"
          active={shortcut === "recentes"}
          onClick={() => setShortcut((s) => (s === "recentes" ? null : "recentes"))}
        />
        <Chip
          icon={Star}
          label={`Favoritos${favorites.length ? ` (${favorites.length})` : ""}`}
          active={shortcut === "favoritos"}
          onClick={() => setShortcut((s) => (s === "favoritos" ? null : "favoritos"))}
        />
        <Chip
          icon={User}
          label="Meus modelos"
          active={shortcut === "meus"}
          onClick={() => setShortcut((s) => (s === "meus" ? null : "meus"))}
        />
      </div>

      {/* 4. Contador discreto logo acima da grade */}
      {!showCustom && (
        <div className="flex items-center px-0.5 pt-0.5">
          <p className="font-mono text-[10px] font-bold tracking-[0.12em] uppercase text-slate-500 dark:text-slate-400">
            MOSTRANDO {parts.length} {parts.length === 1 ? "MODELO" : "MODELOS"}
          </p>
        </div>
      )}

      {showCustom ? (
        <CustomList items={custom} />
      ) : parts.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-center text-[13px] text-muted-foreground">
          Nenhuma peça encontrada para esta combinação.
        </p>
      ) : (
        /* Grade compacta de 3 colunas no mobile (repeat(3, minmax(0, 1fr)), gap: 10px) e 4 colunas no desktop */
        <div
          style={{ gap: "10px" }}
          className="grid grid-cols-3 lg:grid-cols-4 pb-6"
        >
          {parts.map((p, i) => (
            <PartCard
              key={p.id}
              part={p}
              index={i}
              favorite={favorites.includes(p.id)}
              effectiveTheme={effectiveTheme}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Clock;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[9.5px] tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap",
        active
          ? "border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold"
          : "border-slate-300/70 dark:border-white/[0.09] bg-slate-200/40 dark:bg-slate-900/45 text-slate-600 dark:text-slate-300/80 hover:text-slate-900 dark:hover:text-white",
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

/** Renderiza a prévia apenas quando o card entra na tela (performance). */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setSeen(true)),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

function PartCard({
  part,
  index,
  favorite,
  effectiveTheme,
}: {
  part: PartModel;
  index: number;
  favorite: boolean;
  effectiveTheme: "light" | "dark" | "amoled";
}) {
  const { can } = useFeatureAccess();
  const { ref, seen } = useInView<HTMLDivElement>();
  const locked = !can(part.feature);
  const href = partHref(part, part.id);
  const methodBadge = resolvePartMethodBadge(part);

  // Superfície translúcida adaptável ao tema ativo (Claro, Escuro/Cosmos Radial e AMOLED) — ZERO grid de fundo
  const cardSurfaceStyle =
    effectiveTheme === "light"
      ? {
          background: "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }
      : effectiveTheme === "amoled"
        ? {
            background: "rgba(9, 13, 22, 0.65)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
          }
        : {
            background: "rgba(15, 23, 42, 0.42)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          };

  return (
    <div ref={ref} className="relative min-w-0">
      <Link
        to={href.to}
        params={href.params as never}
        search={href.search as never}
        onClick={() => markRecent(part.id)}
        style={{
          ...cardSurfaceStyle,
          animationDelay: `${Math.min(index, 12) * 20}ms`,
        }}
        className="pop-in group relative flex h-full min-h-[146px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-2.5 transition-all duration-200 hover:border-sky-400/40 active:scale-[0.98]"
      >
        {/* 1. TOPO DO CARTÃO: Pílula discreta da especificação do método à esquerda */}
        <div className="relative z-10 flex items-center justify-between gap-1 pr-5">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-[2px] font-mono text-[7.5px] sm:text-[8.5px] font-bold tracking-tight sm:tracking-[0.04em] uppercase whitespace-nowrap",
              effectiveTheme === "light"
                ? "bg-slate-900/[0.06] text-slate-600 border border-slate-900/[0.08]"
                : "bg-white/[0.06] text-slate-300 border border-white/[0.09]",
            )}
          >
            {methodBadge}
          </span>
          {locked && (
            <Lock
              className="size-2.5 shrink-0 text-amber-400"
              aria-label="Recurso PRO"
            />
          )}
        </div>

        {/* 2. CENTRO DO CARTÃO: Miniatura 3D da peça sobre fundo limpo (sem grid atrás) */}
        <div className="relative z-[1] my-1 flex h-[78px] sm:h-[92px] w-full items-center justify-center">
          {seen && <Preview part={part} />}
        </div>

        {/* 3. BASE DO CARTÃO: Exclusivamente o Nome do Modelo */}
        <div className="relative z-10 pt-0.5">
          <h3
            style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1.2 }}
            className={cn(
              "font-display uppercase tracking-tight line-clamp-2",
              effectiveTheme === "light" ? "text-slate-900" : "text-[#F8FAFC]",
            )}
          >
            {part.name}
          </h3>
        </div>
      </Link>

      {/* Botão Favoritar (♡) compacto no canto superior direito */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(part.id);
        }}
        aria-label={favorite ? `Remover ${part.name} dos favoritos` : `Favoritar ${part.name}`}
        aria-pressed={favorite}
        className={cn(
          "absolute top-1.5 right-1.5 z-20 grid size-6 place-items-center rounded-full transition-colors cursor-pointer",
          effectiveTheme === "light"
            ? "text-slate-500 hover:text-slate-900 bg-white/50"
            : "text-slate-300/80 hover:text-white bg-slate-950/35",
        )}
      >
        <Heart className={cn("size-3.5", favorite && "fill-rose-500 text-rose-500")} />
      </button>
    </div>
  );
}

function Preview({ part }: { part: PartModel }) {
  if (part.preview.mode === "vector") {
    const gen = getGenerator(part.preview.generator);
    if (!gen) return null;
    return (
      <VectorPreview
        entities={gen.build(defaultValues(gen))}
        className="size-full scale-[0.92] object-contain text-foreground/85 transition-transform duration-500 group-hover:scale-100"
      />
    );
  }
  return (
    <Wire3D
      model={buildWire(part.preview.slug, { ...DEFAULT_PARAMS, seg: 32 })}
      edgeMode="shaded"
      showRefLines={false}
      className="size-full scale-[0.92] object-contain text-foreground/85 transition-transform duration-500 group-hover:scale-100"
    />
  );
}

function CustomList({ items }: { items: CustomModel[] }) {
  if (!items.length)
    return (
      <p className="glass rounded-2xl p-6 text-center text-[13px] text-muted-foreground">
        Ainda não há modelos seus. Abra uma peça, ajuste as medidas e salve em Meus Modelos.
      </p>
    );
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => {
        const base = findPart(c.baseId);
        if (!base) return null;
        const href = partHref(base, c.baseId);
        const search = { ...(href.search ?? {}), modelo: c.id };
        return (
          <div key={c.id} className="glass flex items-center gap-3 rounded-2xl p-3">
            <Link
              to={href.to}
              params={href.params as never}
              search={search as never}
              onClick={() => markRecent(base.id)}
              className="min-w-0 flex-1"
            >
              <p className="truncate text-[13px] font-bold">{c.name}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground uppercase">
                {CATEGORY_LABEL[base.category]} · {base.name}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => removeCustom(c.id)}
              aria-label={`Excluir ${c.name}`}
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
