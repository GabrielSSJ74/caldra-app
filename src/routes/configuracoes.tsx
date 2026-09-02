import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { PLAN_LABEL } from "@/lib/subscription/features";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import {
  useSettings,
  type AccentColor,
  type ThemeMode,
  type Unit,
} from "@/lib/settings/SettingsProvider";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { PhotoPicker } from "@/components/chameleon/Profile";
import { useProfile } from "@/lib/profile/ProfileProvider";
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
];
const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "amber", label: "Âmbar", swatch: "#F59E0B" },
  { id: "blue", label: "Azul Real", swatch: "#00CCFF" },
];
const UNITS: Unit[] = ["mm", "cm", "m", "in"];

function Configuracoes() {
  const { plan, isMestre, unlockWithCode, reset } = useFeatureAccess();
  const { theme, setTheme, accent, setAccent, unit, setUnit, precision, setPrecision } =
    useSettings();
  const [code, setCode] = useState("");
  const { photo, displayName, role, name, update } = useProfile();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = unlockWithCode(code);
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
          Plano atual: <span className="text-accent">{PLAN_LABEL[plan]}</span>
        </p>
      </header>

      <Panel className="p-4" glow>
        <SectionLabel action={<Sparkles className="size-4 text-accent" />}>Modo Mestre</SectionLabel>
        {isMestre ? (
          <div>
            <p className="text-[13px] text-muted-foreground">
              Laboratório completo ativo: explicações passo a passo, exportação DXF e PDF, editor 2D,
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

      <p className="text-center font-mono text-[10px] text-muted-foreground">
        CALDRA · Traçado e Planificação Zero Fresta
      </p>
    </div>
  );
}
