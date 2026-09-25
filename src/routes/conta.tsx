import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { PLAN_LABEL } from "@/lib/subscription/features";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Conta — CALDRA" },
      {
        name: "description",
        content:
          "Entre na sua conta CALDRA para levar o plano PRO entre aparelhos, ativar códigos e gerenciar seus dados.",
      },
      { property: "og:title", content: "Conta — CALDRA" },
      { property: "og:description", content: "Sessão, plano e exclusão de conta no CALDRA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContaPage,
});

function ContaPage() {
  const { user, ready, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const { plan, refresh, reset } = useFeatureAccess();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res =
      mode === "entrar" ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (res.ok) {
      toast.success(res.message);
      void refresh();
    } else {
      toast.error(res.message);
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account");
    setBusy(false);
    if (error) {
      toast.error("Não foi possível excluir agora. Tente novamente.");
      return;
    }
    await signOut();
    reset();
    toast.success("Conta e dados excluídos.");
  };

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A conta é opcional — o CALDRA funciona offline. Ela serve para levar seu plano entre
          aparelhos.
        </p>
      </header>

      {user ? (
        <>
          <Panel className="space-y-3 p-4" glow>
            <SectionLabel action={<ShieldCheck className="size-4 text-accent" />}>
              Sessão
            </SectionLabel>
            <p className="text-sm">{user.email}</p>
            <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              Plano{" "}
              <span
                className={plan === "free" ? "" : "pro-surface rounded-full px-2 py-0.5 text-pro"}
              >
                {PLAN_LABEL[plan]}
              </span>
            </p>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase"
            >
              <LogOut className="size-3.5" /> Sair
            </button>
          </Panel>

          <Panel className="space-y-3 p-4">
            <SectionLabel action={<Trash2 className="size-4 text-muted-foreground" />}>
              Excluir conta
            </SectionLabel>
            <p className="text-[13px] text-muted-foreground">
              Remove permanentemente sua conta, o plano e as compras vinculadas. Projetos salvos
              somente neste aparelho continuam aqui.
            </p>
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => void removeAccount()}
                  className="rounded-xl border border-destructive/60 px-3 py-2 font-mono text-[11px] tracking-[0.16em] text-destructive uppercase disabled:opacity-50"
                >
                  Confirmar exclusão
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-line px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-xl border border-line px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase"
              >
                Excluir minha conta
              </button>
            )}
          </Panel>
        </>
      ) : (
        <Panel className="space-y-3 p-4" glow>
          <div className="flex gap-1 rounded-xl border border-line p-1">
            {(["entrar", "criar"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "flex-1 rounded-lg px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] uppercase " +
                  (mode === m ? "bg-accent/12 text-accent" : "text-muted-foreground")
                }
              >
                {m === "entrar" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <button
            onClick={async () => {
              const res = await signInWithGoogle();
              if (!res.ok) toast.error(res.message);
            }}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-medium"
          >
            Continuar com Google
          </button>

          <form onSubmit={submit} className="space-y-2">
            {mode === "criar" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-xl border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoComplete={mode === "entrar" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-line bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="brand-gradient w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {mode === "entrar" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
}
