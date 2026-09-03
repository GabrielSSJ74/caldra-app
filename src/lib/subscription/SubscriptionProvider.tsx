import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<Plan>("free");
  const [planSource, setPlanSource] = useState<PlanSource>("none");
  const [ready, setReady] = useState(false);
  const [gatedFeature, setGatedFeature] = useState<Feature | null>(null);
  const { session, ready: authReady } = useAuth();

  const persist = useCallback((next: Plan, source: PlanSource) => {
    setPlan(next);
    setPlanSource(source);
    writeCache(next, source);
  }, []);

  /* 1. cache local — o app abre instantâneo e funciona offline */
  useEffect(() => {
    const cached = readCache();
    setPlan(cached.plan);
    setPlanSource(cached.source);
    setReady(true);
  }, []);

  /* 2. revalidação remota — o servidor manda quando há sessão */
  const refresh = useCallback(async () => {
    try {
      const remote = await fetchRemotePlan();
      if (remote) persist(remote.plan, remote.source);
    } catch {
      /* offline: mantém o cache */
    }
  }, [persist]);

  useEffect(() => {
    if (!authReady) return;
    if (session) void refresh();
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
