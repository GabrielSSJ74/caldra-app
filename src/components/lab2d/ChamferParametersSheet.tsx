/**
 * CALDRA CHAMFER — GAVETA LATERAL DIREITA [ fx Parâmetros & Variantes ] (PILAR 2)
 *
 * - Ancorada na borda direita em paisagem/desktop (270–308px, mesmo padrão da Mini-Calculadora)
 *   e folha inferior compacta (<= 44dvh) em retrato — mantendo o canvas 2D/3D livre para ver
 *   a peça mudar ao vivo durante os testes.
 * - 100% vinculada aos tokens dinâmicos `--chamfer-*` (Tema Claro / Escuro / AMOLED + Cor de Destaque).
 */

import React, { useEffect, useState } from "react";
import { X, Star, Search, Sliders, Layers, Download, Upload, Plus, Trash2 } from "lucide-react";
import {
  chamferParameterStore,
  type ChamferParameter,
  type ParameterConfigurationRow,
  type ParameterUnit,
} from "@/chamfer/core/parameterStore";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferParametersSheetProps {
  open: boolean;
  onClose: () => void;
  onParameterApplied?: (paramName: string, value: number) => void;
  onConfigurationApplied?: (configName: string) => void;
}

const stopCanvasEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

export function ChamferParametersSheet({
  open,
  onClose,
  onParameterApplied,
  onConfigurationApplied,
}: ChamferParametersSheetProps) {
  const [params, setParams] = useState<ChamferParameter[]>(() => chamferParameterStore.getAll());
  const [configs, setConfigs] = useState<ParameterConfigurationRow[]>(() =>
    chamferParameterStore.getConfigurations(),
  );
  const [activeConfigId, setActiveConfigId] = useState<string | null>(() =>
    chamferParameterStore.getActiveConfigurationId(),
  );
  const [tab, setTab] = useState<"params" | "configs">("params");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newExpr, setNewExpr] = useState("");
  const [newUnit, setNewUnit] = useState<ParameterUnit>("mm");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sweepTarget, setSweepTarget] = useState<string | null>(null);
  const [newConfigName, setNewConfigName] = useState("");
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setParams(chamferParameterStore.getAll());
      setConfigs(chamferParameterStore.getConfigurations());
      setActiveConfigId(chamferParameterStore.getActiveConfigurationId());
    };
    sync();
    return chamferParameterStore.subscribe(sync);
  }, []);

  if (!open) return null;

  const filtered = params.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const handleAddParam = () => {
    setErrorMsg(null);
    const res = chamferParameterStore.setParameter(newName, newExpr, {
      unit: newUnit,
      kind: "user",
      favorite: true,
    });
    if (!res.ok) {
      setErrorMsg(res.error ?? "Expressão ou nome inválido");
      return;
    }
    triggerHaptic("selection");
    setNewName("");
    setNewExpr("");
    if (res.parameter) {
      onParameterApplied?.(res.parameter.name, res.parameter.value);
    }
  };

  const handleDownload = (format: "json" | "csv") => {
    const content = format === "json" ? chamferParameterStore.exportJSON() : chamferParameterStore.exportCSV();
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chamfer_parametros.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusBanner(`Exportado chamfer_parametros.${format}`);
    setTimeout(() => setStatusBanner(null), 2200);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const res = file.name.toLowerCase().endsWith(".csv")
        ? chamferParameterStore.importCSV(text)
        : chamferParameterStore.importJSON(text);
      if (!res.ok) {
        setErrorMsg(res.error ?? "Falha ao importar");
      } else {
        setStatusBanner(`${res.importedCount} parâmetro(s) importado(s)`);
        setTimeout(() => setStatusBanner(null), 2400);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <aside
      role="dialog"
      aria-label="Parâmetros e Configurações"
      data-testid="chamfer-parameters-sheet"
      onPointerDown={stopCanvasEvent}
      onWheel={stopCanvasEvent}
      onClick={stopCanvasEvent}
      style={{
        backgroundColor: "var(--chamfer-popover-bg)",
        borderColor: "var(--chamfer-border-strong)",
        color: "var(--chamfer-text-primary)",
        boxShadow: "var(--chamfer-toast-shadow)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      className="fixed bottom-2 left-2 right-2 z-[115] flex max-h-[44dvh] flex-col overflow-hidden rounded-2xl border select-none transition-colors sm:bottom-[44px] sm:left-auto sm:right-2 sm:top-[48px] sm:max-h-none sm:w-[304px]"
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
        }}
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{
              backgroundColor: "var(--chamfer-accent-soft)",
              borderColor: "var(--chamfer-accent-border)",
              color: "var(--chamfer-accent)",
            }}
            className="rounded-lg border px-1.5 py-0.5 font-mono text-[11px] font-bold"
          >
            fx
          </span>
          <h3 className="truncate text-xs font-bold tracking-wide">Parâmetros & Variantes</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel de parâmetros"
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl transition hover:opacity-80 cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs + Import/Export */}
      <div
        style={{ borderColor: "var(--chamfer-border)" }}
        className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b px-2.5 py-1.5"
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab("params")}
            style={
              tab === "params"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    borderColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : {
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-secondary)",
                  }
            }
            className="min-h-[34px] rounded-xl border px-2.5 text-[11px] font-semibold transition cursor-pointer"
          >
            Parâm. ({params.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("configs")}
            style={
              tab === "configs"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    borderColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : {
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-secondary)",
                  }
            }
            className="flex min-h-[34px] items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition cursor-pointer"
          >
            <Layers className="size-3" />
            <span>Config. ({configs.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleDownload("csv")}
            title="Exportar CSV"
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="flex min-h-[32px] items-center gap-1 rounded-lg border px-1.5 text-[10px] font-semibold transition hover:opacity-85 cursor-pointer"
          >
            <Download className="size-3" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleDownload("json")}
            title="Exportar JSON"
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="flex min-h-[32px] items-center gap-1 rounded-lg border px-1.5 text-[10px] font-semibold transition hover:opacity-85 cursor-pointer"
          >
            <Download className="size-3" />
            <span>JSON</span>
          </button>
          <label
            title="Importar JSON ou CSV"
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded-lg border transition hover:opacity-85"
          >
            <Upload className="size-3" />
            <input type="file" accept=".json,.csv" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            borderColor: "var(--chamfer-status-error)",
            color: "var(--chamfer-status-error)",
            backgroundColor: "var(--chamfer-surface-elevated)",
          }}
          className="mx-2.5 mt-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium"
        >
          {errorMsg}
        </div>
      )}
      {statusBanner && (
        <div
          style={{
            borderColor: "var(--chamfer-status-success)",
            color: "var(--chamfer-status-success)",
            backgroundColor: "var(--chamfer-surface-elevated)",
          }}
          className="mx-2.5 mt-2 rounded-xl border px-2.5 py-1 text-[11px] font-medium"
        >
          {statusBanner}
        </div>
      )}

      {tab === "params" ? (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
          {/* Busca */}
          <div className="relative flex items-center">
            <Search
              style={{ color: "var(--chamfer-text-muted)" }}
              className="pointer-events-none absolute left-2.5 size-3.5"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar parâmetro (largura, chapa...)"
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="min-h-[36px] w-full rounded-xl border pl-8 pr-2.5 text-xs outline-none focus:ring-2 focus:ring-[var(--chamfer-accent)]"
            />
          </div>

          {/* Criar novo parâmetro */}
          <div
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="grid grid-cols-12 gap-1 rounded-xl border p-1.5"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="nome"
              style={{
                backgroundColor: "var(--chamfer-bar-bg-solid)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="col-span-4 min-h-[34px] rounded-lg border px-2 font-mono text-[11px] outline-none focus:border-[var(--chamfer-accent)]"
            />
            <input
              type="text"
              value={newExpr}
              onChange={(e) => setNewExpr(e.target.value)}
              placeholder="largura / 4 + 5"
              style={{
                backgroundColor: "var(--chamfer-bar-bg-solid)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="col-span-4 min-h-[34px] rounded-lg border px-2 font-mono text-[11px] outline-none focus:border-[var(--chamfer-accent)]"
            />
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value as ParameterUnit)}
              style={{
                backgroundColor: "var(--chamfer-bar-bg-solid)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="col-span-2 min-h-[34px] rounded-lg border px-1 font-mono text-[10px]"
            >
              <option value="mm">mm</option>
              <option value="deg">°</option>
              <option value="qty">un</option>
            </select>
            <button
              type="button"
              onClick={handleAddParam}
              aria-label="Adicionar parâmetro"
              style={{
                backgroundColor: "var(--chamfer-accent)",
                color: "var(--chamfer-accent-contrast)",
              }}
              className="col-span-2 flex min-h-[34px] items-center justify-center rounded-lg font-bold transition hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* Lista de parâmetros com Slider Sweep */}
          <div className="flex flex-col gap-1.5">
            {filtered.map((p) => {
              const users = chamferParameterStore.getUsersOf(p.name);
              const isSweepOpen = sweepTarget === p.name;
              const sMin = p.sweepMin ?? Math.max(0.5, p.value * 0.25);
              const sMax = p.sweepMax ?? Math.max(20, p.value * 2);

              return (
                <div
                  key={p.name}
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: isSweepOpen ? "var(--chamfer-accent-border)" : "var(--chamfer-border)",
                  }}
                  className="flex flex-col gap-1.5 rounded-xl border p-2"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => chamferParameterStore.toggleFavorite(p.name)}
                        aria-label="Favoritar parâmetro"
                        className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg transition hover:opacity-80 cursor-pointer"
                      >
                        <Star
                          style={{
                            color: p.favorite
                              ? "var(--chamfer-status-warning)"
                              : "var(--chamfer-text-muted)",
                            fill: p.favorite ? "var(--chamfer-status-warning)" : "none",
                          }}
                          className="size-3.5"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span
                            style={{ color: "var(--chamfer-accent)" }}
                            className="truncate font-mono text-[11px] font-bold"
                          >
                            {p.name}
                          </span>
                          <span
                            style={{
                              backgroundColor: "var(--chamfer-bar-bg-solid)",
                              color: "var(--chamfer-text-muted)",
                            }}
                            className="rounded px-1 py-0.5 text-[9px]"
                          >
                            {p.kind === "model" ? "Mod" : "Usr"}
                          </span>
                        </div>
                        <div
                          style={{ color: "var(--chamfer-text-secondary)" }}
                          className="truncate font-mono text-[10px]"
                        >
                          = {p.expression}
                          {users.length > 0 && ` · ${users.length}×`}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-[11px] font-bold">
                        {p.value.toFixed(1)} {p.unit === "deg" ? "°" : p.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSweepTarget(isSweepOpen ? null : p.name)}
                        title="Slider Sweep ao vivo"
                        style={
                          isSweepOpen
                            ? {
                                backgroundColor: "var(--chamfer-accent)",
                                borderColor: "var(--chamfer-accent)",
                                color: "var(--chamfer-accent-contrast)",
                              }
                            : {
                                backgroundColor: "var(--chamfer-bar-bg-solid)",
                                borderColor: "var(--chamfer-border)",
                                color: "var(--chamfer-text-secondary)",
                              }
                        }
                        className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border transition cursor-pointer"
                      >
                        <Sliders className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const rem = chamferParameterStore.removeParameter(p.name);
                          if (!rem.ok) setErrorMsg(rem.error ?? "Não foi possível remover");
                        }}
                        aria-label={`Remover ${p.name}`}
                        style={{
                          backgroundColor: "var(--chamfer-bar-bg-solid)",
                          borderColor: "var(--chamfer-border)",
                          color: "var(--chamfer-text-muted)",
                        }}
                        className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border transition hover:opacity-80 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Slider Sweep ao vivo */}
                  {isSweepOpen && (
                    <div
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg-solid)",
                        borderColor: "var(--chamfer-accent-border)",
                      }}
                      className="flex flex-col gap-1 rounded-lg border px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span style={{ color: "var(--chamfer-text-muted)" }}>{sMin.toFixed(1)}</span>
                        <span style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                          {p.value.toFixed(2)} {p.unit}
                        </span>
                        <span style={{ color: "var(--chamfer-text-muted)" }}>{sMax.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={sMin}
                        max={sMax}
                        step={(sMax - sMin) / 100}
                        value={p.value}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const res = chamferParameterStore.setParameter(
                            p.name,
                            `${val.toFixed(2)} ${p.unit === "deg" ? "deg" : p.unit === "mm" ? "mm" : ""}`.trim(),
                            { unit: p.unit },
                          );
                          if (res.ok && res.parameter) {
                            onParameterApplied?.(res.parameter.name, res.parameter.value);
                          }
                        }}
                        style={{ accentColor: "var(--chamfer-accent)" }}
                        className="h-2 w-full cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Aba de Configurações (Família de Peças: Flange DN50, DN100, DN150...) */
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              placeholder="Nova variante (Flange DN200)..."
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="min-h-[36px] flex-1 rounded-xl border px-2.5 text-xs outline-none focus:border-[var(--chamfer-accent)]"
            />
            <button
              type="button"
              onClick={() => {
                if (!newConfigName.trim()) return;
                chamferParameterStore.saveConfiguration(newConfigName.trim());
                setNewConfigName("");
              }}
              style={{
                backgroundColor: "var(--chamfer-accent)",
                color: "var(--chamfer-accent-contrast)",
              }}
              className="min-h-[36px] shrink-0 rounded-xl px-2.5 text-[11px] font-bold transition hover:brightness-110 cursor-pointer"
            >
              Salvar
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {configs.map((cfg) => {
              const isActive = cfg.id === activeConfigId;
              return (
                <div
                  key={cfg.id}
                  style={{
                    backgroundColor: isActive
                      ? "var(--chamfer-accent-soft)"
                      : "var(--chamfer-surface-elevated)",
                    borderColor: isActive ? "var(--chamfer-accent)" : "var(--chamfer-border)",
                  }}
                  className="flex items-center justify-between gap-2 rounded-xl border p-2 transition"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold">{cfg.name}</div>
                    <div
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="truncate font-mono text-[10px]"
                    >
                      {Object.entries(cfg.overrides)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("confirm");
                        const res = chamferParameterStore.applyConfiguration(cfg.id);
                        if (res.ok) {
                          onConfigurationApplied?.(cfg.name);
                          setStatusBanner(`Variante aplicada: ${cfg.name}`);
                          setTimeout(() => setStatusBanner(null), 2200);
                        }
                      }}
                      style={{
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }}
                      className="min-h-[34px] rounded-lg px-2.5 text-[11px] font-bold transition hover:brightness-110 cursor-pointer"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => chamferParameterStore.deleteConfiguration(cfg.id)}
                      aria-label={`Excluir ${cfg.name}`}
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg-solid)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-muted)",
                      }}
                      className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border transition hover:opacity-80 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
