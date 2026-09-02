import { cn } from "@/lib/utils";

/** Marca abstrata do CALDRA: losango facetado que muda com o tema. */
export function ChameleonMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-gradient grid shrink-0 place-items-center rounded-xl",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" aria-hidden="true">
        <path
          d="M12 2.5 21.5 12 12 21.5 2.5 12Z"
          fill="none"
          stroke="var(--background)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 7.5 16.5 12 12 16.5Z" fill="var(--background)" />
      </svg>
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="font-display text-[15px] font-semibold tracking-wide whitespace-nowrap">
        CALDRA
      </p>
      {!compact && (
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Traçado e Planificação Zero Fresta
        </p>
      )}
    </div>
  );
}
