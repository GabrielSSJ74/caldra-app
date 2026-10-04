import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { readConsent, setConsent } from "@/lib/analytics/consent";
import { toast } from "sonner";
import {
  Sparkles,
  Bug,
  HardDriveDownload,
  PenTool,
  Save,
  Clock,
  ShieldCheck,
  Grid,
  RotateCcw,
  Check,
} from "lucide-react";
import { PLAN_LABEL } from "@/lib/subscription/features";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";
import {
  useSettings,
  type AccentColor,
  type ThemeMode,
  type Unit,
  type AuroraStyle,
  type AppLanguage,
} from "@/lib/settings/SettingsProvider";
import {
  getChamferSettings,
  saveChamferSettings,
  DEFAULT_CHAMFER_SETTINGS,
  type ChamferSettings,
} from "@/lib/lab2d/projectSettings";
import { REGIONS, type RegionId } from "@/lib/regional/regional";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { PhotoPicker } from "@/components/chameleon/Profile";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { Button } from "@/components/chameleon/ds";
import { ReportProblemDialog } from "@/components/chameleon/ReportProblemDialog";
import { BackupDialog } from "@/components/chameleon/BackupDialog";
import { MySubscriptionPanel } from "@/components/chameleon/MySubscriptionPanel";
import { AudioSettingsPanel } from "@/components/audio/AudioSettingsPanel";
import { APP_VERSION, APP_BUILD } from "@/lib/app/version";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — CALDRA" },
      {
        name: "description",
        content: "Ative o Modo Mestre, escolha unidades, precisão decimal e tema da interface.",
      },
      { property: "og:title", content: "Configurações — CALDRA" },
      {
        property: "og:description",
        content: "Preferências do laboratório e ativação do Modo Mestre.",
      },
    ],
  }),
  component: Configuracoes,
});

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: "dark", label: "Escuro" },
  { id: "light", label: "Claro" },
  { id: "system", label: "Sistema" },
  { id: "amoled", label: "AMOLED" },
];
const AURORA_STYLES: { id: AuroraStyle; label: string; hint: string }[] = [
  { id: "fluido", label: "Fluido", hint: "Shader líquido em movimento contínuo" },
  { id: "suave", label: "Fluid Aurora", hint: "Deep Space Light Field — campos de luz flutuando em espaço profundo" },
  { id: "padrao", label: "PADRÃO", hint: "Sem fundo animado — só a cor sólida do tema" },
];
const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "default", label: "Preto e branco", swatch: "var(--foreground)" },
  { id: "amber", label: "Âmbar", swatch: "#F59E0B" },
  { id: "blue", label: "Azul Real", swatch: "#00CCFF" },
  { id: "crimson", label: "Vermelho Carmesim", swatch: "#B22222" },
];
const LANGUAGES: { id: AppLanguage; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];
const UNITS: Unit[] = ["mm", "cm", "m", "in"];

function Configuracoes() {
  const { plan, isMestre, requirePro, unlockWithCode, reset } = useFeatureAccess();
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    unit,
    setUnit,
    precision,
    setPrecision,
    level,
    setLevel,
    region,
    setRegion,
    auroraStyle,
    setAuroraStyle,
    language,
    setLanguage,
  } = useSettings();
  const [code, setCode] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [consent, setConsentState] = useState(false);
  useEffect(() => setConsentState(readConsent()), []);
  const { photo, displayName, role, name, update } = useProfile();
  const { isProcessing, statusText, triggerProcessing, stopProcessing, setProcessing } = useAIProcessing();

  const [chamferSettings, setChamferSettings] = useState<ChamferSettings>(DEFAULT_CHAMFER_SETTINGS);

  useEffect(() => {
    setChamferSettings(getChamferSettings());
    const onSettingsChanged = () => {
      setChamferSettings(getChamferSettings());
    };
    window.addEventListener("chamfer-settings-changed", onSettingsChanged);
    return () => {
      window.removeEventListener("chamfer-settings-changed", onSettingsChanged);
    };
  }, []);

  const updateChamfer = (patch: Partial<ChamferSettings>) => {
    const updated = saveChamferSettings(patch);
    setChamferSettings(updated);
    toast.success("Configurações do CHAMFER atualizadas.");
  };

  const resetChamfer = () => {
    const updated = saveChamferSettings(DEFAULT_CHAMFER_SETTINGS);
    setChamferSettings(updated);
    toast.success("Configurações do CHAMFER restauradas.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await unlockWithCode(code);
    if (res.ok) {
      setCode("");
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel className="flex flex-col items-center gap-3 px-4 py-7" glow>
        <PhotoPicker
          photo={photo}
          size={132}
          label={photo ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
          onPhoto={(p) => update({ photo: p })}
        />
        <div className="w-full text-center">
          <input
            value={name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={displayName}
            aria-label="Nome"
            className="w-full bg-transparent text-center font-display text-xl font-semibold outline-none"
          />
          <input
            value={role}
            onChange={(e) => update({ role: e.target.value })}
            placeholder="Caldeireiro"
            aria-label="Profissão"
            className="mt-1 w-full bg-transparent text-center font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase outline-none"
          />
        </div>
      </Panel>

      <header>
        <h1 className="font-display text-2xl font-semibold">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plano atual:{" "}
          <span
            className={
              plan === "free"
                ? "text-muted-foreground"
                : "pro-surface rounded-full px-2 py-0.5 text-pro"
            }
          >
            {PLAN_LABEL[plan]}
          </span>
          {" · "}
          <Link to="/pro" className="underline">
            Ver planos
          </Link>
          {" · "}
          <Link to="/conta" className="underline">
            Conta
          </Link>
        </p>
      </header>

      <Panel className="p-4" glow>
        <SectionLabel action={<Sparkles className="size-4 text-pro" />}>CALDRA PRO</SectionLabel>
        {isMestre ? (
          <div>
            <p className="text-[13px] text-muted-foreground">
              Laboratório completo ativo: explicações passo a passo, exportação DXF e PDF, CHAMFER,
              escola e biblioteca integrais.
            </p>
            <button
              onClick={() => {
                reset();
                toast.success("CALDRA PRO desativado neste aparelho.");
              }}
              className="mt-3 rounded-xl border border-border px-3 py-2 font-mono text-[11px] text-muted-foreground"
            >
              Desativar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código de acesso"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-xl border border-line bg-background/50 px-3 py-2.5 font-mono text-sm tracking-[0.2em] uppercase outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="brand-gradient rounded-xl px-4 py-2.5 text-sm font-semibold text-background"
            >
              Ativar
            </button>
          </form>
        )}
      </Panel>

      <MySubscriptionPanel />

      <ReportProblemDialog open={reportOpen} onOpenChange={setReportOpen} />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />

      <Panel className="space-y-4 p-4">
        <div>
          <SectionLabel>Tema</SectionLabel>
          <div className="flex gap-1.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  if (t.id === "light") {
                    setAuroraStyle("fluido");
                  }
                }}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                  theme === t.id
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-line text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <SectionLabel>Cor de destaque</SectionLabel>
            <div className="flex gap-1.5">
              {ACCENTS.map((a) => {
                const isActive = accent === a.id || (a.id === "crimson" && accent === "magenta");
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      /* Azul e Carmesim são liberados; as demais abrem o convite do PRO caso restrito */
                      if (a.id !== "blue" && a.id !== "crimson" && !requirePro("accent.colors")) return;
                      setAccent(a.id);
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                      isActive
                        ? "border-accent/25 bg-accent/10 text-accent font-medium shadow-xs"
                        : "border-line text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      style={{ background: a.swatch }}
                    />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <SectionLabel>Estilo do fundo</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {AURORA_STYLES.map((a) => {
                const locked = !isMestre && a.id === "suave";
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      if (locked && !requirePro("aurora.animated")) return;
                      setAuroraStyle(a.id);
                    }}
                    aria-pressed={auroraStyle === a.id}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] uppercase transition-colors",
                      locked && "cursor-not-allowed opacity-45",
                      auroraStyle === a.id
                        ? "border-accent/25 bg-accent/10 text-accent"
                        : "border-line text-muted-foreground",
                    )}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {AURORA_STYLES.find((a) => a.id === auroraStyle)?.hint ??
                (isMestre
                  ? ""
                  : "Fluido e Suave fazem parte do CALDRA PRO. O estilo Padrão segue disponível.")}
            </p>
          </div>

          {/* Controle do Estado Híbrido de IA do Organic Light Field */}
          <div className="mt-3.5 rounded-2xl border border-line/60 bg-surface/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-foreground">
                  Estado de IA do Organic Light Field
                </span>
                <p className="text-[10px] text-muted-foreground">
                  Híbrido de ondas, crista superior e pulsação quando a IA está processando.
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider border",
                  isProcessing
                    ? "border-accent/40 bg-accent/15 text-accent animate-pulse"
                    : "border-line bg-surface text-muted-foreground"
                )}
              >
                <span className={cn("size-1.5 rounded-full", isProcessing ? "bg-accent" : "bg-muted-foreground/50")} />
                {isProcessing ? (statusText ?? "Processando IA") : "Ocioso"}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (isProcessing) {
                    stopProcessing();
                  } else {
                    triggerProcessing(8000, "Calculando Traçado & Malha IA");
                  }
                }}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                  isProcessing
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                    : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                )}
              >
                {isProcessing ? "Encerrar Simulação" : "Simular Processamento (8s)"}
              </button>
              <button
                type="button"
                onClick={() => setProcessing(!isProcessing, isProcessing ? undefined : "Em Processamento")}
                className="rounded-xl border border-line px-3 py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {isProcessing ? "Desativar" : "Modo Contínuo"}
              </button>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Unidade de exibição</SectionLabel>
          <div className="flex gap-1.5">
            {UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                  unit === u
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-line text-muted-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Idioma</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {LANGUAGES.map((item) => (
              <button
                key={item.id}
                onClick={() => setLanguage(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                  language === item.id
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-line text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Altera o idioma da interface. Textos ainda não traduzidos permanecem em português.
          </p>
        </div>

        <div>
          <SectionLabel>Formato regional</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(Object.keys(REGIONS) as RegionId[]).map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={cn(
                  "rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                  region === r
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-line text-muted-foreground",
                )}
              >
                {REGIONS[r].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Define moeda ({REGIONS[region].currency}), formato de números, chapas comerciais e o
            imposto padrão do orçamento. A medida interna continua sempre em milímetro.
          </p>
        </div>

        <div>
          <SectionLabel>Modo de aprendizagem</SectionLabel>
          <div className="flex gap-1.5">
            {(["aprendiz", "mestre"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] uppercase transition-colors",
                  level === l
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-line text-muted-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {level === "aprendiz"
              ? "Fórmulas visíveis nos resultados, dicas em cada campo e Aprender em destaque."
              : "Fluxo direto: fórmulas ocultas até você pedir. O cálculo é exatamente o mesmo."}
          </p>
        </div>

        <div>
          <SectionLabel>Casas decimais</SectionLabel>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={4}
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-6 text-right font-mono text-sm">{precision}</span>
          </div>
        </div>
      </Panel>

      {/* CONFIGURAÇÕES DO CHAMFER CAD & AUTOSAVE */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-center justify-between border-b border-line/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent border border-accent/25">
              <PenTool className="size-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold leading-tight">
                CHAMFER CAD · Autosave & Prancheta
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Salvamento automático, proteção contra perdas e preferências do editor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetChamfer}
            title="Restaurar padrões do CHAMFER"
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:border-line/80 transition-colors"
          >
            <RotateCcw className="size-3" />
            Padrão
          </button>
        </div>

        {/* 1. AUTOSAVE ON/OFF */}
        <div className="flex items-center justify-between rounded-xl border border-line/60 bg-card/40 p-3">
          <div className="flex items-center gap-2.5">
            <Save className="size-4 text-accent" />
            <div>
              <span className="font-display text-sm font-medium">Salvamento Automático (Autosave)</span>
              <p className="text-[11px] text-muted-foreground">
                Gravação contínua em segundo plano no armazenamento local do navegador
              </p>
            </div>
          </div>
          <div className="flex items-center rounded-lg border border-line bg-background p-0.5">
            <button
              type="button"
              onClick={() => updateChamfer({ autoSave: true })}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                chamferSettings.autoSave
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              ON
            </button>
            <button
              type="button"
              onClick={() => updateChamfer({ autoSave: false })}
              className={cn(
                "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                !chamferSettings.autoSave
                  ? "bg-muted text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              OFF
            </button>
          </div>
        </div>

        {/* 2. INTERVALO DE GRAVAÇÃO */}
        <div
          className={cn(
            "space-y-2 transition-opacity",
            !chamferSettings.autoSave && "opacity-45 pointer-events-none",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-foreground font-medium">
              <Clock className="size-3.5 text-accent" />
              Intervalo do Autosave
            </span>
            <span className="font-mono text-xs font-semibold text-accent">
              {chamferSettings.autoSaveIntervalSec < 60
                ? `${chamferSettings.autoSaveIntervalSec} segundos`
                : `${chamferSettings.autoSaveIntervalSec / 60} min`}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { sec: 10, label: "10s" },
              { sec: 15, label: "15s" },
              { sec: 30, label: "30s" },
              { sec: 60, label: "1 min" },
              { sec: 120, label: "2 min" },
            ].map((item) => (
              <button
                key={item.sec}
                type="button"
                onClick={() => updateChamfer({ autoSaveIntervalSec: item.sec })}
                className={cn(
                  "rounded-xl border py-1.5 text-center font-mono text-[10px] font-bold transition-all",
                  chamferSettings.autoSaveIntervalSec === item.sec
                    ? "border-accent/40 bg-accent/15 text-accent shadow-xs"
                    : "border-line bg-card/40 text-muted-foreground hover:border-line/80 hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. RECUPERAÇÃO DE PROJETOS (CRASH RECOVERY) */}
        <div className="flex items-center justify-between rounded-xl border border-line/60 bg-card/40 p-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 text-emerald-500" />
            <div>
              <span className="font-display text-sm font-medium">
                Recuperação de Projetos & Sessão
              </span>
              <p className="text-[11px] text-muted-foreground">
                Restaura o estado exato da prancheta em caso de fechamento acidental ou recarga
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              updateChamfer({ recoveryEnabled: !chamferSettings.recoveryEnabled })
            }
            className={cn(
              "size-6 rounded-lg grid place-items-center border transition-all",
              chamferSettings.recoveryEnabled
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-500"
                : "border-line bg-background text-transparent",
            )}
          >
            <Check className="size-3.5" />
          </button>
        </div>

        {/* 4. PREFERÊNCIAS DE INTERFACE DO CHAMFER */}
        <div className="space-y-3 pt-1">
          <SectionLabel>Preferências de Interface do Editor</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => updateChamfer({ showGridOnLoad: !chamferSettings.showGridOnLoad })}
              className={cn(
                "flex items-center justify-between rounded-xl border p-2.5 font-mono text-[11px] transition-colors",
                chamferSettings.showGridOnLoad
                  ? "border-accent/25 bg-accent/10 text-accent font-medium"
                  : "border-line text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Grid className="size-3.5" />
                Grade CAD ao inicializar
              </span>
              <span className="text-[10px] font-bold uppercase">
                {chamferSettings.showGridOnLoad ? "ON" : "OFF"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => updateChamfer({ snapOnLoad: !chamferSettings.snapOnLoad })}
              className={cn(
                "flex items-center justify-between rounded-xl border p-2.5 font-mono text-[11px] transition-colors",
                chamferSettings.snapOnLoad
                  ? "border-accent/25 bg-accent/10 text-accent font-medium"
                  : "border-line text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5" />
                Snap Magnético ativo
              </span>
              <span className="text-[10px] font-bold uppercase">
                {chamferSettings.snapOnLoad ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Unidade do CHAMFER
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(["mm", "cm", "pol"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => updateChamfer({ unit: u })}
                    className={cn(
                      "rounded-lg border py-1.5 text-center font-mono text-[10px] font-bold uppercase transition-all",
                      chamferSettings.unit === u
                        ? "border-accent/30 bg-accent/15 text-accent"
                        : "border-line bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Precisão de Cotagem
              </span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { val: 0, label: "0 (1mm)" },
                  { val: 1, label: "1 (0.1)" },
                  { val: 2, label: "2 (0.01)" },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => updateChamfer({ dimPrecision: p.val })}
                    className={cn(
                      "rounded-lg border py-1.5 text-center font-mono text-[10px] font-bold uppercase transition-all",
                      chamferSettings.dimPrecision === p.val
                        ? "border-accent/30 bg-accent/15 text-accent"
                        : "border-line bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* ÁUDIO & IDENTIDADE SONORA (SEÇÃO 16 DO PROMPT) */}
      <AudioSettingsPanel />

      <Panel className="space-y-3 p-4">
        <SectionLabel>Backup</SectionLabel>
        <p className="text-[13px] text-muted-foreground">
          Salve um arquivo com projetos, materiais, preferências e perfil — e traga tudo de volta em
          outro aparelho.
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={HardDriveDownload}
          onClick={() => setBackupOpen(true)}
        >
          Backup e restauração
        </Button>
      </Panel>

      <Panel className="space-y-3 p-4">
        <SectionLabel>Privacidade</SectionLabel>
        <label className="flex items-start gap-3 text-[13px]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsentState(e.target.checked);
              void setConsent(e.target.checked);
            }}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            Enviar estatísticas de uso anônimas
            <span className="block text-muted-foreground">
              Ajuda a priorizar melhorias. Nenhuma medida, desenho ou projeto é enviado.
            </span>
          </span>
        </label>
        <div className="flex gap-3 font-mono text-[11px] tracking-[0.16em] uppercase">
          <Link to="/privacidade" className="text-muted-foreground underline">
            Privacidade
          </Link>
          <Link to="/termos" className="text-muted-foreground underline">
            Termos
          </Link>
          <Link to="/conta" className="text-muted-foreground underline">
            Excluir conta
          </Link>
        </div>
      </Panel>

      <Panel className="space-y-3 p-4">
        <SectionLabel>Suporte</SectionLabel>
        <p className="text-[13px] text-muted-foreground">
          Versão {APP_VERSION} · compilação {APP_BUILD}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={Bug} onClick={() => setReportOpen(true)}>
            Reportar um problema
          </Button>
          <Link
            to="/novidades"
            className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase underline"
          >
            Novidades
          </Link>
        </div>
      </Panel>
      <p className="text-center font-mono text-[10px] text-muted-foreground">
        CALDRA · Traçado e Planificação Zero Fresta
      </p>
    </div>
  );
}
