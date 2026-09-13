import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { readConsent, setConsent } from "@/lib/analytics/consent";
import { toast } from "sonner";
import { Sparkles, Bug, HardDriveDownload } from "lucide-react";
import { PLAN_LABEL } from "@/lib/subscription/features";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import {
  useSettings,
  type AccentColor,
  type ThemeMode,
  type Unit,
  type AuroraStyle,
  type AppLanguage,
} from "@/lib/settings/SettingsProvider";
import { REGIONS, type RegionId } from "@/lib/regional/regional";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { PhotoPicker } from "@/components/chameleon/Profile";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { Button } from "@/components/chameleon/ds";
import { ReportProblemDialog } from "@/components/chameleon/ReportProblemDialog";
import { BackupDialog } from "@/components/chameleon/BackupDialog";
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
  { id: "suave", label: "Suave", hint: "Massas de luz leves, menor custo" },
  { id: "padrao", label: "PADRÃO", hint: "Sem fundo animado — só a cor sólida do tema" },
];
const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "default", label: "Preto e branco", swatch: "var(--foreground)" },
  { id: "amber", label: "Âmbar", swatch: "#F59E0B" },
  { id: "blue", label: "Azul Real", swatch: "#00CCFF" },
  { id: "magenta", label: "Magenta", swatch: "#A01550" },
];
const LANGUAGES: { id: AppLanguage; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];
const UNITS: Unit[] = ["mm", "cm", "m", "in"];

function Configuracoes() {
  const { plan, isMestre, unlockWithCode, reset } = useFeatureAccess();
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
        <SectionLabel action={<Sparkles className="size-4 text-pro" />}>Modo Mestre</SectionLabel>
        {isMestre ? (
          <div>
            <p className="text-[13px] text-muted-foreground">
              Laboratório completo ativo: explicações passo a passo, exportação DXF e PDF, CHAMFER,
              escola e biblioteca integrais.
            </p>
            <button
              onClick={() => {
                reset();
                toast.success("Modo Mestre desativado.");
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

      <ReportProblemDialog open={reportOpen} onOpenChange={setReportOpen} />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />

      <Panel className="space-y-4 p-4">
        <div>
          <SectionLabel>Tema</SectionLabel>
          <div className="flex gap-1.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
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
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                    accent === a.id
                      ? "border-accent/25 bg-accent/10 text-accent"
                      : "border-line text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: a.swatch }}
                  />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <SectionLabel>Estilo do fundo</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {AURORA_STYLES.map((a) => {
                /* Sem PRO o fundo não anima: os estilos animados ficam
                   indisponíveis em vez de prometer algo que não acontece. */
                const locked = !isMestre && (a.id === "fluido" || a.id === "suave");
                return (
                  <button
                    key={a.id}
                    onClick={() => !locked && setAuroraStyle(a.id)}
                    disabled={locked}
                    aria-pressed={auroraStyle === a.id}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 font-mono text-[11px] uppercase transition-colors",
                      locked && "cursor-not-allowed opacity-45",
                      auroraStyle === a.id && !locked
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
              {isMestre
                ? AURORA_STYLES.find((a) => a.id === auroraStyle)?.hint
                : "Os fundos em movimento fazem parte do plano PRO."}
            </p>
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
              <button key={item.id} onClick={() => setLanguage(item.id)} className={cn(
                "rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                language === item.id ? "border-accent/25 bg-accent/10 text-accent" : "border-line text-muted-foreground",
              )}>{item.label}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Altera o idioma da interface. Textos ainda não traduzidos permanecem em português.</p>
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
