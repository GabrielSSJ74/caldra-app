import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  PROTOTYPE_MASTER_CODE,
  planAllows,
  type Feature,
  type Plan,
} from "./features";

const STORAGE_KEY = "chameleon.plan";

type SubscriptionValue = {
  plan: Plan;
  isMestre: boolean;
  ready: boolean;
  can: (feature: Feature) => boolean;
  unlockWithCode: (code: string) => { ok: boolean; message: string };
  reset: () => void;
};

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<Plan>("free");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "mestre" || stored === "oficina") setPlan(stored);
    } catch {
      /* storage indisponível */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Plan) => {
    setPlan(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage indisponível */
    }
  }, []);

  const value = useMemo<SubscriptionValue>(
    () => ({
      plan,
      isMestre: plan !== "free",
      ready,
      can: (feature) => planAllows(plan, feature),
      unlockWithCode: (code) => {
        const normalized = code.trim().toUpperCase();
        if (!normalized) return { ok: false, message: "Informe o código de acesso." };
        if (normalized !== PROTOTYPE_MASTER_CODE) {
          return { ok: false, message: "Código inválido. Verifique e tente novamente." };
        }
        persist("mestre");
        return { ok: true, message: "Modo Mestre ativado." };
      },
      reset: () => persist("free"),
    }),
    [plan, ready, persist],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

/** Hook central de permissões. */
export function useFeatureAccess(): SubscriptionValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useFeatureAccess deve ser usado dentro de SubscriptionProvider");
  return ctx;
}

export const useSubscription = useFeatureAccess;
