/**
 * PAYWALL ÚNICO — todo caminho para o PRO passa por este componente.
 * Ele aparece de duas formas:
 *   • `PaywallDialog` — gate suave disparado por uma funcionalidade específica.
 *   • Rota /pro — a mesma vitrine em página inteira.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, ExternalLink, Lock, Minus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { FEATURE_PITCH, PLAN_LABEL, planAllows, type Feature } from "@/lib/subscription/features";
import {
  PRODUCTS,
  WEB_CHECKOUT_URL,
  hasPlayBilling,
  queryProductDetails,
  type ProductId,
} from "@/lib/subscription/billing";
import { PRICING, formatPrice, isBrl } from "@/lib/subscription/pricing";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Panel, SectionLabel } from "./ui";

/** Comparativo real: lido da matriz de permissões, nunca escrito à mão. */
const COMPARED: Feature[] = [
  "geometry.basic",
  "geometry.advanced",
  "calc.explanation",
  "planification.advanced",
  "lab2d",
  "export.png",
  "export.pdf",
  "export.dxf",
  "projects.unlimited",
  "school.full",
  "library.full",
];

function ComparisonTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-line bg-white/[0.02] px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        <span>Recurso</span>
        <span className="w-10 text-center">Free</span>
        <span className="w-10 text-center text-accent">Pro</span>
      </div>
      {COMPARED.map((feature) => {
        const free = planAllows("free", feature);
        return (
          <div
            key={feature}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-line/60 px-3 py-2 text-[13px] last:border-0"
          >
            <span>{FEATURE_PITCH[feature].title}</span>
            <span className="grid w-10 place-items-center">
              {free ? (
                <Check className="size-3.5 text-muted-foreground" />
              ) : (
                <Minus className="size-3.5 text-muted-foreground/40" />
              )}
            </span>
            <span className="grid w-10 place-items-center">
              <Check className="size-3.5 text-accent" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PaywallBody({ onDone }: { onDone?: () => void }) {
  const { buy, restore, unlockWithCode, plan } = useFeatureAccess();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const playAvailable = hasPlayBilling();
  /** Dentro da TWA o preço exibido vem do Play Billing, nunca das constantes. */
  const [playPrices, setPlayPrices] = useState<Partial<Record<ProductId, string>>>({});
  const brl = isBrl();

  useEffect(() => {
    if (!playAvailable) return;
    let alive = true;
    void queryProductDetails().then((p) => {
      if (alive) setPlayPrices(p);
    });
    return () => {
      alive = false;
    };
  }, [playAvailable]);

  const priceOf = (key: "monthly" | "yearly" | "lifetime") => {
    const entry = PRICING[key];
    if (entry.product && playPrices[entry.product]) return playPrices[entry.product]!;
    return formatPrice(entry, brl);
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast.success(res.message);
      onDone?.();
    } else {
      toast.error(res.message);
    }
  };

  if (plan !== "free") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Você já está no <span className="text-accent">CALDRA {PLAN_LABEL[plan]}</span>. Tudo liberado.
        </p>
        <ComparisonTable />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-display text-lg leading-snug">
        Da medida ao corte em <span className="text-accent">2 minutos</span>.
      </p>

      <ComparisonTable />

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          disabled={busy !== null}
          onClick={() =>
            playAvailable
              ? run("m", () => buy(PRODUCTS.monthly))
              : window.open(WEB_CHECKOUT_URL, "_blank", "noopener")
          }
          className="rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
        >
          <span className="block font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Mensal
          </span>
          <span className="font-display text-lg font-semibold">{PRICES.monthly}</span>
          <span className="block text-[11px] text-muted-foreground">por mês, cancela quando quiser</span>
        </button>

        <button
          disabled={busy !== null}
          onClick={() =>
            playAvailable
              ? run("y", () => buy(PRODUCTS.yearly))
              : window.open(WEB_CHECKOUT_URL, "_blank", "noopener")
          }
          className="glow-ring rounded-xl border border-accent/50 bg-accent/8 px-4 py-3 text-left disabled:opacity-50"
        >
          <span className="block font-mono text-[10px] tracking-[0.18em] text-accent uppercase">
            Anual · melhor preço
          </span>
          <span className="font-display text-lg font-semibold">{PRICES.yearly}</span>
          <span className="block text-[11px] text-muted-foreground">equivale a 2 meses grátis</span>
        </button>
      </div>

      {!playAvailable && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ExternalLink className="size-3" />
          Fora do aplicativo da loja a compra é concluída no site e liberada por código.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowCode((v) => !v)}
          className="rounded-xl border border-line px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase"
        >
          Já tenho plano
        </button>
        <button
          disabled={busy !== null}
          onClick={() => run("r", restore)}
          className="rounded-xl border border-line px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase disabled:opacity-50"
        >
          Restaurar compra
        </button>
      </div>

      {showCode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("c", () => unlockWithCode(code));
          }}
          className="space-y-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CALDRA-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-background/50 px-3 py-2.5 font-mono text-sm tracking-[0.18em] uppercase outline-none focus:border-accent"
          />
          {!user && (
            <p className="text-[11px] text-muted-foreground">
              O código fica preso à sua conta.{" "}
              <Link to="/conta" className="text-accent underline">
                Entrar agora
              </Link>
              .
            </p>
          )}
          <button
            type="submit"
            disabled={busy !== null}
            className="brand-gradient w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            Ativar código
          </button>
        </form>
      )}
    </div>
  );
}

/** Gate suave: abre com o convite da funcionalidade tocada. */
export function PaywallDialog() {
  const { gatedFeature, closeGate } = useFeatureAccess();
  const pitch = gatedFeature ? FEATURE_PITCH[gatedFeature] : null;

  return (
    <Dialog open={gatedFeature !== null} onOpenChange={(o) => !o && closeGate()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Lock className="size-4 text-accent" />
            {pitch?.title ?? "CALDRA PRO"}
          </DialogTitle>
        </DialogHeader>
        {pitch && <p className="text-sm text-muted-foreground">{pitch.benefit}</p>}
        <PaywallBody onDone={closeGate} />
      </DialogContent>
    </Dialog>
  );
}

/** Cartão de vitrine usado na rota /pro. */
export function PaywallPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("space-y-4 p-4", className)} glow>
      <SectionLabel>CALDRA PRO</SectionLabel>
      <PaywallBody />
    </Panel>
  );
}
