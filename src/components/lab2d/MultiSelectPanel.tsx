/**
 * PAINEL DE SELEÇÃO MÚLTIPLA — propriedades agregadas e ações em lote.
 * Usa o MESMO PanelPositionManager da seleção individual (o painel hospedeiro).
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Boxes, Copy, Eye, Layers, Move, Trash2, Waypoints } from "lucide-react";

import type { Entity, Layer } from "@/lib/lab2d/core";
import { translate, uid } from "@/lib/lab2d/core";
import { reverseEntity } from "@/lib/lab2d/cutPlan";
import { createGroup, type GroupDef } from "@/lib/lab2d/groups";
import {
  DEFAULT_LEAD,
  ORIENTATION_LABEL,
  cncOf,
  contourContaining,
  isDirectional,
  totalLengthOf,
  withCnc,
  type Lead,
  type LeadKind,
} from "@/lib/lab2d/manufacturing";
import { isUserLayer } from "@/lib/lab2d/technical";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<Entity["type"], string> = {
  line: "LINE",
  polyline: "POLYLINE",
  circle: "CIRCLE",
  arc: "ARC",
  path: "CURVA",
  text: "TEXTO",
};

const MIXED = "MISTO";

export function MultiSelectPanel({
  entities,
  selected,
  setSelection,
  commit,
  layers,
  groups,
  setGroups,
}: {
  entities: Entity[];
  selected: Entity[];
  setSelection: (ids: string[]) => void;
  commit: (next: Entity[] | ((p: Entity[]) => Entity[])) => void;
  layers: Layer[];
  groups: GroupDef[];
  setGroups: (g: GroupDef[]) => void;
}) {
  const ids = useMemo(() => selected.map((e) => e.id), [selected]);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

  const byType = useMemo(() => {
    const m = new Map<Entity["type"], number>();
    for (const e of selected) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [selected]);

  const layerValue = useMemo(() => {
    const set = new Set(selected.map((e) => e.layer));
    return set.size === 1 ? [...set][0]! : MIXED;
  }, [selected]);

  const visibleValue = useMemo(() => {
    const set = new Set(selected.map((e) => layers.find((l) => l.id === e.layer)?.visible !== false));
    return set.size === 1 ? ([...set][0] ? "Visível" : "Oculto") : MIXED;
  }, [selected, layers]);

  const directional = selected.filter(isDirectional);
  const total = totalLengthOf(selected);
  const contour = useMemo(
    () => (ids[0] ? contourContaining(entities, ids[0]) : null),
    [entities, ids],
  );

  const patch = (f: (e: Entity) => Entity) =>
    commit((list) => list.map((e) => (ids.includes(e.id) ? f(e) : e)));

  const leadValue = (which: "in" | "out"): LeadKind | typeof MIXED => {
    const set = new Set(
      directional.map((e) => (which === "in" ? cncOf(e).leadIn : cncOf(e).leadOut)?.kind ?? "none"),
    );
    return set.size === 1 ? ([...set][0] as LeadKind) : MIXED;
  };

  const setLead = (which: "in" | "out", kind: LeadKind) =>
    patch((e) => {
      if (!isDirectional(e)) return e;
      const cur = (which === "in" ? cncOf(e).leadIn : cncOf(e).leadOut) ?? DEFAULT_LEAD;
      const lead: Lead = { ...cur, kind };
      return withCnc(e, which === "in" ? { leadIn: lead } : { leadOut: lead });
    });

  return (
    <div className="space-y-2">
      <div>
        <p className="tick-label text-accent">Seleção múltipla</p>
        <p className="font-mono text-[11px]">{selected.length} entidades</p>
      </div>

      <Row label="Tipos">
        <span className="font-mono text-[10px]">
          {byType.map(([t, n]) => `${TYPE_LABEL[t]} ${n}`).join(" · ")}
        </span>
      </Row>

      <Row label="Camada">
        <select
          value={layerValue}
          onChange={(ev) => {
            const v = ev.target.value;
            if (v === MIXED) return;
            patch((e) => ({ ...e, layer: v }));
          }}
          aria-label="Camada da seleção"
          className="w-28 rounded-lg border border-line bg-background/40 px-1 py-0.5 font-mono text-[10px] outline-none"
        >
          {layerValue === MIXED && <option value={MIXED}>{MIXED}</option>}
          {layers
            .filter((l) => isUserLayer(l.id))
            .map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Visibilidade">
        <span className="font-mono text-[10px] text-muted-foreground">{visibleValue}</span>
      </Row>

      <Row label="Comprimento total">
        <span className="font-mono text-[10px] tabular-nums">{total.toFixed(2)} mm</span>
      </Row>

      {/* -------------------------------------------------- lead-in / out */}
      {directional.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="tick-label mb-1 text-muted-foreground">Entrada / saída</p>
          {(["in", "out"] as const).map((which) => (
            <Row key={which} label={which === "in" ? "Lead-in" : "Lead-out"}>
              <select
                value={leadValue(which)}
                onChange={(ev) => setLead(which, ev.target.value as LeadKind)}
                aria-label={which === "in" ? "Lead-in" : "Lead-out"}
                className="w-24 rounded-lg border border-line bg-background/40 px-1 py-0.5 font-mono text-[10px] outline-none"
              >
                {leadValue(which) === MIXED && <option value={MIXED}>{MIXED}</option>}
                <option value="none">Nenhum</option>
                <option value="line">Reta</option>
                <option value="arc">Arco</option>
              </select>
            </Row>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------- em lote */}
      <div className="flex flex-wrap gap-1 border-t border-line pt-2">
        <Act
          label="Inverter sentido"
          icon={ArrowLeftRight}
          disabled={!directional.length}
          onClick={() => {
            commit((list) =>
              list.map((e) => (ids.includes(e.id) && isDirectional(e) ? reverseEntity(e) : e)),
            );
            toast.success(`${directional.length} trajetória(s) invertida(s).`);
          }}
        />
        <Act
          label="Agrupar"
          icon={Boxes}
          onClick={() => {
            const res = createGroup(entities, ids, groups);
            if (!res) {
              toast.info("Selecione 2 ou mais entidades.");
              return;
            }

            commit(res.entities);
            setGroups(res.groups);
          }}
        />
        <Act
          label="Duplicar"
          icon={Copy}
          onClick={() => {
            const copies = selected.map((e) => translate({ ...e, id: uid() }, 10, 10));
            commit((list) => [...list, ...copies]);
            setSelection(copies.map((e) => e.id));
          }}
        />
        <Act
          label="Ocultar"
          icon={Eye}
          onClick={() => {
            patch((e) => ({ ...e, layer: "construcao" }));
            toast.info("Movidas para Construção (fora da saída de fabricação).");
          }}
        />
        <Act
          label="Excluir"
          icon={Trash2}
          onClick={() => {
            commit((list) => list.filter((e) => !ids.includes(e.id)));
            setSelection([]);
          }}
        />
      </div>

      <div className="flex items-center gap-1">
        <NumIn label="ΔX" value={dx} set={setDx} />
        <NumIn label="ΔY" value={dy} set={setDy} />
        <Act
          label="Mover"
          icon={Move}
          onClick={() => patch((e) => translate(e, dx, dy))}
        />
      </div>

      {/* --------------------------------------------- selecionar contorno */}
      {contour && (
        <div className="border-t border-line pt-2">
          <p className="tick-label mb-1 text-muted-foreground">
            Contorno {String(contour.sequence).padStart(2, "0")}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {contour.ids.length} entidades · {contour.closed ? "FECHADO" : "ABERTO"} ·{" "}
            {ORIENTATION_LABEL[contour.orientation]} ·{" "}
            {contour.length.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm
          </p>
          <Act
            label="Selecionar contorno"
            icon={Waypoints}
            onClick={() => setSelection(contour.ids)}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="font-mono text-[9px] text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

function NumIn({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      <span className="font-mono text-[9px] text-muted-foreground">{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(ev) => Number.isFinite(Number(ev.target.value)) && set(Number(ev.target.value))}
        className="w-12 rounded-lg border border-line bg-background/40 px-1 py-0.5 text-right font-mono text-[10px] outline-none"
      />
    </label>
  );
}

function Act({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Layers;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-line px-1.5 py-1 font-mono text-[9px] text-muted-foreground hover:text-foreground",
        disabled && "opacity-40",
      )}
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}
