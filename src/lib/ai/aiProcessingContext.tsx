import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

export type AIProcessingContextValue = {
  isProcessing: boolean;
  statusText?: string;
  startProcessing: (statusText?: string) => () => void;
  stopProcessing: () => void;
  triggerProcessing: (durationMs?: number, statusText?: string) => void;
  setProcessing: (active: boolean, statusText?: string) => void;
};

const AIProcessingContext = createContext<AIProcessingContextValue | null>(null);

export function AIProcessingProvider({ children }: { children: ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string | undefined>(undefined);

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    setStatusText(undefined);
  }, []);

  const setProcessing = useCallback((active: boolean, text?: string) => {
    setIsProcessing(active);
    setStatusText(text);
  }, []);

  const startProcessing = useCallback((text?: string) => {
    setIsProcessing(true);
    setStatusText(text);
    return () => {
      setIsProcessing(false);
      setStatusText(undefined);
    };
  }, []);

  const triggerProcessing = useCallback((durationMs = 6000, text?: string) => {
    setIsProcessing(true);
    setStatusText(text);
    const timer = setTimeout(() => {
      setIsProcessing(false);
      setStatusText(undefined);
    }, durationMs);
    return () => clearTimeout(timer);
  }, []);

  const value = useMemo(
    () => ({
      isProcessing,
      statusText,
      startProcessing,
      stopProcessing,
      triggerProcessing,
      setProcessing,
    }),
    [isProcessing, statusText, startProcessing, stopProcessing, triggerProcessing, setProcessing]
  );

  return (
    <AIProcessingContext.Provider value={value}>
      {children}
    </AIProcessingContext.Provider>
  );
}

export function useAIProcessing(): AIProcessingContextValue {
  const ctx = useContext(AIProcessingContext);
  if (!ctx) {
    return {
      isProcessing: false,
      statusText: undefined,
      startProcessing: () => () => {},
      stopProcessing: () => {},
      triggerProcessing: () => {},
      setProcessing: () => {},
    };
  }
  return ctx;
}
