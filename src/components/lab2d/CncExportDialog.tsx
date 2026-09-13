/**
 * EXPORTAR DXF CNC — pré-visualização de fabricação e mapeamento de layers.
 * O DXF completo continua existindo e não é afetado por este caminho.
 *
 * A operação vem do PAPEL da entidade (role), nunca da cor.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportDxf } from "@/lib/dxf/dxfService";
import {
  DEFAULT_CNC_OPTIONS,
  buildCncDxf,
  cncCounts,
  cncCutLength,
  layerMapping,
  preflightCnc,
  validateCncExport,
  verifyCncDxf,
  type CncExportOptions,
  type CncRole,
} from "@/lib/dxf/cncExport";
import { DEFAULT_LAYERS, type Entity } from "@/lib/lab2d/core";
import { renderSvg } from "@/lib/lab2d/render";
import { DXF_PROFILES, ENTITY_ROLES, roleOf, ROLE_LABEL } from "@/lib/lab2d/roles";
import { cn } from "@/lib/utils";
import { LxdsAnalysisDialog } from "@/components/lab2d/LxdsAnalysisDialog";

export function CncExportDialog({
  open,
  onOpenChange,
  entities,
  filename,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entities: Entity[];
  filename: string;
}) {
  const [opts, setOpts] = useState<CncExportOptions>(DEFAULT_CNC_OPTIONS);
  const [lxdsOpen, setLxdsOpen] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof verifyCncDxf> | null>(null);

  const counts = useMemo(() => cncCounts(entities), [entities]);
  const issues = useMemo(() => validateCncExport(entities, opts), [entities, opts]);
  const errors = issues.filter((i) => i.level === "error");
  const mapping = useMemo(() => layerMapping(opts), [opts]);
  const preflight = useMemo(() => preflightCnc(entities, opts), [entities, opts]);

  // PRÉ-VISUALIZAÇÃO CNC: só o que realmente vai para o arquivo
  const preview = useMemo(() => {
    const visible = entities.filter((e) => {
      const r = roleOf(e);
      return !!r && (ENTITY_ROLES as string[]).includes(r) && opts.roles[r as CncRole];
    });
    return visible.length
      ? renderSvg(visible, DEFAULT_LAYERS, { dimensions: false, background: "white" })
      : null;
  }, [entities, opts.roles]);

  const toggle = (r: CncRole) =>
    setOpts((o) => ({ ...o, roles: { ...o.roles, [r]: !o.roles[r] } }));

  const setProfile = (profileId: string) => {
    const profile = DXF_PROFILES.find((p) => p.id === profileId);
    if (!profile) return;
    setOpts((o) => ({
      ...o,
      profileId,
      roles: ENTITY_ROLES.reduce(
        (acc, r) => ({ ...acc, [r]: profile.layerMap[r] !== null }),
        {} as Record<CncRole, boolean>,
      ),
    }));
    setReport(null);
  };

  const run = () => {
    if (errors.length) {
      toast.error("Erro de fabricação — corrija antes de exportar.");
      return;
    }
    const doc = buildCncDxf(entities, opts);
    if (!doc.entities.length) {
      toast.error("Nenhuma geometria nas layers escolhidas.");
      return;
    }
    const text = exportDxf(doc);
    const check = verifyCncDxf(entities, opts, text);
    setReport(check);
    const blob = new Blob([text], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-cnc.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    if (check.ok) toast.success("DXF CNC gerado e conferido.");
    else toast.warning("DXF CNC gerado com divergências — veja a conferência.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70dvh] w-[min(90vw,32rem)] max-w-none flex-col gap-3 overflow-y-auto border border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Exportar DXF CNC</DialogTitle>
        </DialogHeader>

        {/* perfil de exportação */}
        <div className="flex flex-wrap gap-1.5">
          {DXF_PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              className={cn(
                "rounded-xl border border-border px-3 py-2 text-left transition-colors",
                opts.profileId === p.id && "border-accent/50 bg-accent/10 text-accent",
              )}
            >
              <span className="block font-mono text-[10px] tracking-widest">{p.name}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {DXF_PROFILES.find((p) => p.id === opts.profileId)?.description}
        </p>

        {/* pré-visualização CNC — exatamente o que vai para o arquivo */}
        <div
          className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-border bg-white p-2 [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{
            __html:
              preview?.svg ??
              '<span style="font-family:monospace;font-size:11px;color:#64748b">Nenhuma geometria selecionada</span>',
          }}
        />

        {/* contagem e liga/desliga por papel */}
        <div className="space-y-1">
          {ENTITY_ROLES.map((r) => {
            const on = opts.roles[r as CncRole];
            const layer = mapping.find((m) => m.role === r)?.layer;
            return (
              <button
                key={r}
                onClick={() => toggle(r as CncRole)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left transition-colors",
                  on ? "border-accent/50 bg-accent/10" : "opacity-60",
                )}
              >
                <span className="font-mono text-[11px] tracking-widest">{r}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {counts[r as CncRole]} entidades
                  {r === "CUT" &&
                    ` · ${counts.contours} contornos · ${counts.outer} externo · ${counts.holes} furos · ${counts.slots} rasgos`}
                </span>
                <span className="ml-auto font-mono text-[9px] uppercase">
                  {on && layer ? (
                    <span className="text-accent">→ {layer}</span>
                  ) : (
                    <span className="text-muted-foreground">não exportado</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] tracking-wider uppercase">
          <button
            onClick={() => setOpts((o) => ({ ...o, leads: !o.leads }))}
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              opts.leads && "border-accent/50 text-accent",
            )}
          >
            Lead-in {counts.leadIn} · Lead-out {counts.leadOut}
          </button>
          <button
            onClick={() =>
              setOpts((o) => ({ ...o, bendAs: o.bendAs === "BEND" ? "MARK" : "BEND" }))
            }
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              opts.bendAs === "MARK" && "border-warn/60 text-warn",
            )}
          >
            Dobra → {opts.bendAs}
          </button>
          <button
            onClick={() => setOpts((o) => ({ ...o, flattenCurves: !o.flattenCurves }))}
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              opts.flattenCurves && "border-warn/60 text-warn",
            )}
          >
            {opts.flattenCurves ? "Curvas achatadas" : "Curvas como SPLINE"}
          </button>
        </div>

        <p className="font-mono text-[10px] text-muted-foreground">
          mm · escala 1:1 · {cncCutLength(entities).toFixed(1)} mm de corte · ordem planejada
          preservada na estrutura do arquivo · direção é metadado, nunca geometria.
        </p>

        {/* correspondência visível antes de exportar */}
        <div className="rounded-xl border border-border px-3 py-2 font-mono text-[10px]">
          <p className="mb-1 tracking-widest uppercase">Correspondência de layers</p>
          {mapping.map((m) => (
            <p key={m.role} className={m.layer ? "text-muted-foreground" : "opacity-60"}>
              {m.role} ({ROLE_LABEL[m.role]}) → {m.layer ?? "não exportado"}
            </p>
          ))}
        </div>

        {counts.unclassified > 0 && (
          <p className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
            ERRO DE FABRICAÇÃO · {counts.unclassified} entidade(s) sem função de fabricação. Nada é
            exportado sem classificação.
          </p>
        )}

        {issues.length > 0 && (
          <ul className="space-y-0.5 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[11px] text-warn">
            {issues.slice(0, 6).map((i, k) => (
              <li key={k}>
                {i.level === "error" ? "ERRO DE FABRICAÇÃO" : "Aviso"} · {i.scope}: {i.message}
              </li>
            ))}
          </ul>
        )}

        {/* preflight antes do download */}
        <div className="rounded-xl border border-border px-3 py-2 font-mono text-[10px]">
          <p className="mb-1 tracking-widest uppercase">
            {errors.length === 0 ? "DXF CNC READY" : "DXF CNC — pendências"}
          </p>
          {preflight.map((r) => (
            <p key={r.label} className={r.ok ? "text-muted-foreground" : "text-warn"}>
              {r.ok ? "✓" : "✗"} {r.label}: {r.value}
            </p>
          ))}
        </div>

        {report && (
          <div className="rounded-xl border border-border px-3 py-2 font-mono text-[10px]">
            <p className="mb-1 tracking-widest uppercase">Conferência do arquivo</p>
            {report.rows.map((r) => (
              <p key={r.field} className={r.ok ? "text-muted-foreground" : "text-warn"}>
                {r.ok ? "✓" : "✗"} {r.field}: {r.actual}
                {!r.ok && ` (esperado ${r.expected})`}
              </p>
            ))}
          </div>
        )}

        <button
          onClick={() => setLxdsOpen(true)}
          className="rounded-xl border border-border px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          Analisar arquivo LXDS do CypCut (referência técnica, somente leitura)
        </button>
        <LxdsAnalysisDialog open={lxdsOpen} onOpenChange={setLxdsOpen} />

        <div className="flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            Fechar
          </button>
          <button
            onClick={run}
            className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background transition-transform active:scale-[0.98]"
          >
            Exportar DXF CNC
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
