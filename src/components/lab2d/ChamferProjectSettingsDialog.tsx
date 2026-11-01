import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Save,
  RotateCcw,
  Sliders,
  Ruler,
  Grid,
  Check,
  Clock,
  ShieldCheck,
  Palette,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import {
  getChamferSettings,
  saveChamferSettings,
  type ChamferSettings,
} from "@/lib/lab2d/projectSettings";
import {
  useSettings,
  type AccentOption,
  type AuroraStyleOption,
  type ThemeOption,
} from "@/lib/settings/SettingsProvider";
import { useChamferAppearance } from "./useIntentTheme";
import { toast } from "@/lib/lab2d/chamferNotify";
import { cn } from "@/lib/utils";

interface ChamferProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | undefined;
  projectName?: string | undefined;
  onSettingsChange?: (updated: ChamferSettings) => void;
}

const ACCENT_OPTIONS: { id: AccentOption; label: string; swatch: string }[] = [
  { id: "blue", label: "Azul", swatch: "#0066FF" },
  { id: "amber", label: "Âmbar", swatch: "#FF6B00" },
  { id: "crimson", label: "Carmesim", swatch: "#DC143C" },
  { id: "magenta", label: "Magenta", swatch: "#E6007E" },
  { id: "default", label: "Grafite", swatch: "#3B82F6" },
];

const BG_STYLE_OPTIONS: { id: AuroraStyleOption; label: string; desc: string }[] = [
  { id: "padrao", label: "Padrão", desc: "Sólido Técnico" },
  { id: "suave", label: "Suave", desc: "Radial Mate" },
  { id: "fluido", label: "Fluido", desc: "Luz de Destaque" },
];

const THEME_OPTIONS: { id: ThemeOption; label: string }[] = [
  { id: "dark", label: "Escuro (Graphite)" },
  { id: "light", label: "Claro (Mate)" },
  { id: "amoled", label: "AMOLED (Preto)" },
  { id: "system", label: "Sistema" },
];

export function ChamferProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onSettingsChange,
}: ChamferProjectSettingsDialogProps) {
  const [settings, setSettings] = useState<ChamferSettings>(() =>
    getChamferSettings(projectId),
  );
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    auroraStyle,
    setAuroraStyle,
    cardOpacity,
    setCardOpacity,
    bubbleOpacity,
    setBubbleOpacity,
  } = useSettings();
  const { cssVariables } = useChamferAppearance();

  useEffect(() => {
    if (open) {
      setSettings(getChamferSettings(projectId));
    }
  }, [open, projectId]);

  const handleUpdate = (patch: Partial<ChamferSettings>) => {
    const updated = saveChamferSettings(patch, projectId);
    setSettings(updated);
    onSettingsChange?.(updated);
  };

  const handleSaveAndClose = () => {
    toast.success("Configurações do CHAMFER salvas com sucesso!");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          ...cssVariables,
          backgroundColor: "var(--chamfer-popover-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-primary)",
        }}
        className="max-w-xl max-h-[min(90vh,660px)] overflow-y-auto rounded-2xl border p-5 shadow-2xl backdrop-blur-xl font-mono text-[11px]"
      >
        <DialogHeader
          style={{ borderColor: "var(--chamfer-border)" }}
          className="border-b pb-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  backgroundColor: "var(--chamfer-accent-soft)",
                  borderColor: "var(--chamfer-accent-border)",
                  color: "var(--chamfer-accent)",
                }}
                className="grid size-8 place-items-center rounded-xl border"
              >
                <Sliders className="size-4" />
              </div>
              <div>
                <DialogTitle
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="font-mono text-sm font-bold uppercase tracking-wider"
                >
                  Configurações · CHAMFER CAD
                </DialogTitle>
                <DialogDescription
                  style={{ color: "var(--chamfer-text-secondary)" }}
                  className="font-mono text-[10px]"
                >
                  {projectName
                    ? `Preferências do projeto: ${projectName}`
                    : "Aparência, superfície técnica e preferências do projeto"}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* SEÇÃO 0: APARÊNCIA, COR DE DESTAQUE, ESTILO DE FUNDO E OPACIDADE */}
          <div
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="rounded-xl border p-3.5 space-y-3.5"
          >
            <div className="flex items-center gap-2">
              <Palette
                style={{ color: "var(--chamfer-accent)" }}
                className="size-4"
              />
              <div>
                <h4
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="font-bold text-[11px] uppercase tracking-wide"
                >
                  Aparência, Superfície e Opacidade
                </h4>
                <p
                  style={{ color: "var(--chamfer-text-secondary)" }}
                  className="text-[9.5px]"
                >
                  Aplicado imediatamente às barras, painéis, grade e área de trabalho
                </p>
              </div>
            </div>

            {/* MODO DE TEMA */}
            <div>
              <label
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="block text-[9.5px] mb-1.5 uppercase tracking-wider"
              >
                Modo de Exibição (Tema)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {THEME_OPTIONS.map((t) => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={(e) => setTheme(t.id, e)}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--chamfer-accent)",
                              borderColor: "var(--chamfer-accent)",
                              color: "var(--chamfer-accent-contrast)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-bar-bg)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-bold text-[9.5px] transition-all cursor-pointer"
                    >
                      {t.id === "light" ? (
                        <Sun className="size-3" />
                      ) : (
                        <Moon className="size-3" />
                      )}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ESTILO DE FUNDO */}
            <div>
              <label
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="block text-[9.5px] mb-1.5 uppercase tracking-wider"
              >
                Estilo de Fundo da Área de Desenho
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {BG_STYLE_OPTIONS.map((bg) => {
                  const active = auroraStyle === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setAuroraStyle(bg.id)}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--chamfer-accent)",
                              borderColor: "var(--chamfer-accent)",
                              color: "var(--chamfer-accent-contrast)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-bar-bg)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="flex flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center transition-all cursor-pointer"
                    >
                      <span className="font-bold text-[10px] flex items-center gap-1">
                        <Sparkles className="size-2.5" />
                        {bg.label}
                      </span>
                      <span className="text-[8.5px] opacity-80">{bg.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* COR DE DESTAQUE */}
            <div>
              <label
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="block text-[9.5px] mb-1.5 uppercase tracking-wider"
              >
                Cor de Destaque (Ferramentas Ativas & Seleção de UI)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {ACCENT_OPTIONS.map((item) => {
                  const active = accent === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAccent(item.id)}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--chamfer-accent-soft)",
                              borderColor: item.swatch,
                              color: "var(--chamfer-text-primary)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-bar-bg)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-bold text-[9.5px] transition-all cursor-pointer"
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0 border border-white/30"
                        style={{ backgroundColor: item.swatch }}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* OPACIDADE DOS PAINÉIS E BOLHAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="text-[9.5px] uppercase tracking-wider"
                  >
                    Opacidade das Barras / Painéis
                  </span>
                  <span
                    style={{ color: "var(--chamfer-accent)" }}
                    className="font-bold text-[10px]"
                  >
                    {cardOpacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={100}
                  step={5}
                  value={cardOpacity}
                  onChange={(e) => setCardOpacity(Number(e.target.value))}
                  style={{ accentColor: "var(--chamfer-accent)" }}
                  className="w-full h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="text-[9.5px] uppercase tracking-wider"
                  >
                    Opacidade de Pílulas / HUDs
                  </span>
                  <span
                    style={{ color: "var(--chamfer-accent)" }}
                    className="font-bold text-[10px]"
                  >
                    {bubbleOpacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={bubbleOpacity}
                  onChange={(e) => setBubbleOpacity(Number(e.target.value))}
                  style={{ accentColor: "var(--chamfer-accent)" }}
                  className="w-full h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 1: SALVAMENTO AUTOMÁTICO */}
          <div
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="rounded-xl border p-3.5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save
                  style={{ color: "var(--chamfer-accent)" }}
                  className="size-4"
                />
                <div>
                  <h4
                    style={{ color: "var(--chamfer-text-primary)" }}
                    className="font-bold text-[11px] uppercase tracking-wide"
                  >
                    Salvamento Automático
                  </h4>
                  <p
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="text-[9.5px]"
                  >
                    Gravação periódica em segundo plano no armazenamento local do navegador
                  </p>
                </div>
              </div>

              {/* TOGGLE ON / OFF */}
              <div
                style={{
                  backgroundColor: "var(--chamfer-bar-bg)",
                  borderColor: "var(--chamfer-border)",
                }}
                className="flex items-center rounded-lg border p-0.5"
              >
                <button
                  type="button"
                  onClick={() => handleUpdate({ autoSave: true })}
                  style={
                    settings.autoSave
                      ? {
                          backgroundColor: "var(--chamfer-accent)",
                          color: "var(--chamfer-accent-contrast)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer"
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate({ autoSave: false })}
                  style={
                    !settings.autoSave
                      ? {
                          backgroundColor: "var(--chamfer-border)",
                          color: "var(--chamfer-text-primary)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer"
                >
                  OFF
                </button>
              </div>
            </div>

            {/* INTERVALO DE SALVAMENTO AUTOMÁTICO */}
            <div
              style={{ borderColor: "var(--chamfer-border)" }}
              className={cn(
                "pt-2 border-t transition-opacity",
                !settings.autoSave && "opacity-40 pointer-events-none",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="flex items-center gap-1.5 text-[10px]"
                >
                  <Clock
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="size-3.5"
                  />
                  Intervalo de Gravação Automática
                </span>
                <span
                  style={{ color: "var(--chamfer-accent)" }}
                  className="font-bold text-[10px]"
                >
                  {settings.autoSaveIntervalSec < 60
                    ? `${settings.autoSaveIntervalSec} segundos`
                    : `${settings.autoSaveIntervalSec / 60} min`}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { sec: 10, label: "10s" },
                  { sec: 15, label: "15s" },
                  { sec: 30, label: "30s" },
                  { sec: 60, label: "1 min" },
                  { sec: 120, label: "2 min" },
                ].map((item) => {
                  const active = settings.autoSaveIntervalSec === item.sec;
                  return (
                    <button
                      key={item.sec}
                      type="button"
                      onClick={() => handleUpdate({ autoSaveIntervalSec: item.sec })}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--chamfer-accent)",
                              borderColor: "var(--chamfer-accent)",
                              color: "var(--chamfer-accent-contrast)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-bar-bg)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="rounded-lg border px-2 py-1.5 text-center font-bold text-[9.5px] transition-all cursor-pointer"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RECUPERAÇÃO DE SESSÃO */}
            <div
              style={{ borderColor: "var(--chamfer-border)" }}
              className="flex items-center justify-between pt-2 border-t"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-emerald-500" />
                <span
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="text-[10px]"
                >
                  Proteção e Recuperação contra Falhas (Crash Recovery)
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdate({ recoveryEnabled: !settings.recoveryEnabled })}
                style={
                  settings.recoveryEnabled
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "transparent",
                      }
                }
                className="size-5 rounded grid place-items-center border transition-all cursor-pointer"
              >
                <Check className="size-3.5" />
              </button>
            </div>
          </div>

          {/* SEÇÃO 2: UNIDADES E PRECISÃO */}
          <div
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="rounded-xl border p-3.5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Ruler
                style={{ color: "var(--chamfer-accent)" }}
                className="size-4"
              />
              <h4
                style={{ color: "var(--chamfer-text-primary)" }}
                className="font-bold text-[11px] uppercase tracking-wide"
              >
                Unidades & Precisão Dimensional
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label
                  style={{ color: "var(--chamfer-text-secondary)" }}
                  className="block text-[9.5px] mb-1 uppercase tracking-wider"
                >
                  Unidade Padrão
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: "mm", label: "Milímetro (mm)" },
                    { id: "cm", label: "Centímetro (cm)" },
                    { id: "pol", label: "Polegada (in)" },
                  ].map((u) => {
                    const active = settings.unit === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleUpdate({ unit: u.id as ChamferSettings["unit"] })}
                        style={
                          active
                            ? {
                                backgroundColor: "var(--chamfer-accent)",
                                borderColor: "var(--chamfer-accent)",
                                color: "var(--chamfer-accent-contrast)",
                              }
                            : {
                                backgroundColor: "var(--chamfer-bar-bg)",
                                borderColor: "var(--chamfer-border)",
                                color: "var(--chamfer-text-secondary)",
                              }
                        }
                        className="rounded-lg border px-1.5 py-1 text-center font-bold text-[9px] uppercase transition-all cursor-pointer"
                      >
                        {u.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  style={{ color: "var(--chamfer-text-secondary)" }}
                  className="block text-[9.5px] mb-1 uppercase tracking-wider"
                >
                  Casas Decimais
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { val: 0, label: "0 (1 mm)" },
                    { val: 1, label: "1 (0.1 mm)" },
                    { val: 2, label: "2 (0.01 mm)" },
                  ].map((p) => {
                    const active = settings.dimPrecision === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => handleUpdate({ dimPrecision: p.val })}
                        style={
                          active
                            ? {
                                backgroundColor: "var(--chamfer-accent)",
                                borderColor: "var(--chamfer-accent)",
                                color: "var(--chamfer-accent-contrast)",
                              }
                            : {
                                backgroundColor: "var(--chamfer-bar-bg)",
                                borderColor: "var(--chamfer-border)",
                                color: "var(--chamfer-text-secondary)",
                              }
                        }
                        className="rounded-lg border px-1.5 py-1 text-center font-bold text-[9px] uppercase transition-all cursor-pointer"
                      >
                        {p.val}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: VISUALIZAÇÃO E INTERFACE */}
          <div
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="rounded-xl border p-3.5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Grid
                style={{ color: "var(--chamfer-accent)" }}
                className="size-4"
              />
              <h4
                style={{ color: "var(--chamfer-text-primary)" }}
                className="font-bold text-[11px] uppercase tracking-wide"
              >
                Preferências de Inicialização CAD
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label
                style={{
                  backgroundColor: "var(--chamfer-bar-bg)",
                  borderColor: "var(--chamfer-border)",
                }}
                className="flex items-center justify-between rounded-lg border p-2 cursor-pointer"
              >
                <span
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="text-[10px]"
                >
                  Grade CAD Inicial Ativa
                </span>
                <input
                  type="checkbox"
                  checked={settings.showGridOnLoad}
                  onChange={(e) => handleUpdate({ showGridOnLoad: e.target.checked })}
                  style={{ accentColor: "var(--chamfer-accent)" }}
                  className="rounded size-3.5"
                />
              </label>

              <label
                style={{
                  backgroundColor: "var(--chamfer-bar-bg)",
                  borderColor: "var(--chamfer-border)",
                }}
                className="flex items-center justify-between rounded-lg border p-2 cursor-pointer"
              >
                <span
                  style={{ color: "var(--chamfer-text-primary)" }}
                  className="text-[10px]"
                >
                  Snap Magnético Inicial
                </span>
                <input
                  type="checkbox"
                  checked={settings.snapOnLoad}
                  onChange={(e) => handleUpdate({ snapOnLoad: e.target.checked })}
                  style={{ accentColor: "var(--chamfer-accent)" }}
                  className="rounded size-3.5"
                />
              </label>
            </div>
          </div>
        </div>

        {/* RODAPÉ DO MODAL */}
        <div
          style={{ borderColor: "var(--chamfer-border)" }}
          className="flex items-center justify-between border-t pt-3"
        >
          <button
            type="button"
            onClick={() => {
              handleUpdate({
                autoSave: true,
                autoSaveIntervalSec: 30,
                recoveryEnabled: true,
                unit: "mm",
                dimPrecision: 1,
                showGridOnLoad: true,
                snapOnLoad: true,
              });
              setTheme("dark");
              setAuroraStyle("padrao");
              setAccent("blue");
              setCardOpacity(90);
              setBubbleOpacity(35);
              toast.info("Configurações redefinidas para os padrões.");
            }}
            style={{ color: "var(--chamfer-text-secondary)" }}
            className="flex items-center gap-1.5 text-[10px] hover:opacity-100 opacity-85 cursor-pointer"
          >
            <RotateCcw className="size-3" /> Restaurar Padrões
          </button>

          <button
            type="button"
            onClick={handleSaveAndClose}
            style={{
              backgroundColor: "var(--chamfer-accent)",
              borderColor: "var(--chamfer-accent-border)",
              color: "var(--chamfer-accent-contrast)",
            }}
            className="flex items-center gap-1.5 rounded-xl border px-4 py-2 font-bold uppercase shadow-md transition-opacity hover:opacity-90 cursor-pointer"
          >
            <Check className="size-3.5" /> Concluir & Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
