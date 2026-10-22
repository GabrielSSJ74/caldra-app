import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CaldraLogo } from "@/components/caldra/Logo";

interface CaldraGenesisPreIntroProps {
  onComplete: () => void;
  forceOriginalColors?: boolean;
  className?: string;
}

const FIRST_RUN_KEY = "caldra_genesis_first_run_completed";

/**
 * TELA DE ABERTURA OFICIAL DO CALDRA (SPLASH SCREEN)
 * Exibe exclusivamente o componente oficial <CaldraLogo /> (imagem oficial sem redesenho em SVG,
 * sem mira, sem ponto central e sem deformação geométrica), acompanhado do nome CALDRA
 * e do slogan "ENGENHARIA EM FORMA".
 */
export function CaldraGenesisPreIntro({
  onComplete,
  className,
}: CaldraGenesisPreIntroProps) {
  const [isExiting, setIsExiting] = useState(false);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const handleFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      localStorage.setItem(FIRST_RUN_KEY, "true");
    } catch {
      /* ignore */
    }
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, 1800);

    const completeTimer = window.setTimeout(() => {
      handleFinish();
    }, 2150);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(completeTimer);
    };
  }, [handleFinish]);

  return (
    <div
      aria-label="Abertura oficial Caldra"
      role="dialog"
      aria-modal="true"
      onClick={handleFinish}
      className={cn(
        "fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden select-none pointer-events-auto bg-[#040914]",
        "transition-opacity duration-300 ease-out",
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100",
        className,
      )}
    >
      <div className="flex flex-col items-center justify-center gap-5 px-6 text-center">
        <CaldraLogo size={148} className="rounded-3xl" />
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-[0.22em] text-white">
            CALDRA
          </h1>
          <p className="font-mono text-[11px] sm:text-xs tracking-[0.28em] text-slate-400 uppercase">
            ENGENHARIA EM FORMA
          </p>
        </div>
      </div>
    </div>
  );
}
