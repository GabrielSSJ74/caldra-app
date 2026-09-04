import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  PROTOTYPE_MASTER_CODE,
  planAllows,
  type Feature,
  type Plan,
} from "./features";
import {
  fetchRemotePlan,
  readCache,
  redeemActivationCode,
  registerPurchase,
  writeCache,
  type PlanSource,
} from "./entitlementService";
import { buyWithPlay, hasPlayBilling, listPlayPurchases, type ProductId } from "./billing";
import { useAuth } from "@/lib/auth/AuthProvider";

type Result = { ok: boolean; message: string };

type SubscriptionValue = {
  plan: Plan;
  planSource: PlanSource;
  isMestre: boolean;
  ready: boolean;
  /** ÚNICO ponto de checagem de acesso do aplicativo. */
  can: (feature: Feature) => boolean;
  /** Gate suave: devolve `false` e abre o convite específico da feature. */
  requirePro: (feature: Feature) => boolean;
  gatedFeature: Feature | null;
  closeGate: () => void;
  unlockWithCode: (code: string) => Promise<Result>;
  buy: (product: ProductId) => Promise<Result>;
  restore: () => Promise<Result>;
  refresh: () => Promise<void>;
  reset: () => void;
};

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

/** Estado inicial SÍNCRONO — a UI nunca pinta um plano diferente do cache. */
const initial = () => (typeof window === "undefined" ? { plan: "free" as Plan, source: "none" as PlanSource } : readCache());

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [boot] = useState(initial);
  const [plan, setPlan] = useState<Plan>(boot.plan);
  const [planSource, setPlanSource] = useState<PlanSource>(boot.source);
  const [ready] = useState(true);
  const [gatedFeature, setGatedFeature] = useState<Feature | null>(null);
  const { session, ready: authReady } = useAuth();

  const persist = useCallback((next: Plan, source: PlanSource) => {
    setPlan(next);
    setPlanSource(source);
    writeCache(next, source);
  }, []);

  /* Revalidação remota — resposta DEFINITIVA do servidor manda; qualquer
     falha, timeout ou resposta parcial mantém o último valor conhecido. */
  const refresh = useCallback(async () => {
    try {
      const remote = await fetchRemotePlan();
      if (!remote) return; // sem sessão / offline / erro → mantém o cache
      persist(remote.plan, remote.source);
    } catch {
      /* offline: mantém o cache */
    }
  }, [persist]);

  /* Uma sincronização por conta — navegar NUNCA revalida. */
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!authReady) return;
    const uid = session?.user?.id ?? null;
    if (!uid) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === uid) return;
    syncedFor.current = uid;
    void refresh();
  }, [authReady, session, refresh]);

  const value = useMemo<SubscriptionValue>(() => {
    const can = (feature: Feature) => planAllows(plan, feature);
    return {
      plan,
      planSource,
      isMestre: plan !== "free",
      ready,
      can,
      requirePro: (feature) => {
        if (can(feature)) return true;
        setGatedFeature(feature);
        return false;
      },
      gatedFeature,
      closeGate: () => setGatedFeature(null),
      unlockWithCode: async (code) => {
        const normalized = code.trim().toUpperCase();
        if (!normalized) return { ok: false, message: "Informe o código." };
        if (normalized === PROTOTYPE_MASTER_CODE) {
          persist("mestre", "local");
          return { ok: true, message: "Modo Mestre ativado." };
        }
        const res = await redeemActivationCode(normalized);
        if (res.ok) persist("mestre", "code");
        return res;
      },
      buy: async (product) => {
        if (!hasPlayBilling()) {
          return { ok: false, message: "Compra na loja indisponível aqui. Use o site ou um código de ativação." };
        }
        try {
          const purchase = await buyWithPlay(product);
          if (!purchase) return { ok: false, message: "Compra não concluída." };
          const res = await registerPurchase(purchase.productId, purchase.token, "play");
          if (res.ok) persist("mestre", "play");
          return res;
        } catch {
          return { ok: false, message: "Compra cancelada." };
        }
      },
      restore: async () => {
        const remote = await fetchRemotePlan();
        if (remote?.plan !== "free" && remote) {
          persist(remote.plan, remote.source);
          return { ok: true, message: "Plano restaurado." };
        }
        const purchases = await listPlayPurchases();
        const first = purchases[0];
        if (!first) return { ok: false, message: "Nenhuma compra encontrada nesta conta." };
        const res = await registerPurchase(first.productId, first.token, "play");
        if (res.ok) persist("mestre", "play");
        return res;
      },
      refresh,
      reset: () => persist("free", "none"),
    };
  }, [plan, planSource, ready, gatedFeature, persist, refresh]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

/** Hook central de permissões. */
export function useFeatureAccess(): SubscriptionValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useFeatureAccess deve ser usado dentro de SubscriptionProvider");
  return ctx;
}

export const useSubscription = useFeatureAccess;
