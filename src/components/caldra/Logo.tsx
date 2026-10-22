import React from "react";
import { cn } from "@/lib/utils";

/**
 * RECURSO OFICIAL ÚNICO DA LOGO DO CALDRA
 * Aponta exclusivamente para o arquivo de imagem oficial fornecido (sem aproximação vetorial SVG).
 */
export const CALDRA_LOGO_SRC =
  "/assets/aistudio/file_000000002214820eb6cb9975b671bfdd_baf1f0b1.png";

export interface CaldraLogoProps {
  className?: string;
  size?: number | string;
  animated?: boolean;
  glow?: boolean;
  alt?: string;
}

/**
 * Componente oficial e único da logo do CALDRA.
 * Renderiza a imagem oficial íntegra em proporção quadrada 1:1 (aspect-square / object-contain),
 * preservando a geometria original, os gradientes de azul/ciano/branco, a estrela central de 4 pontas
 * e o fundo azul-marinho escuro (#040914), sem efeitos artificiais, sem mira e sem redesenho em SVG.
 */
export function CaldraLogo({
  className,
  size = 36,
  alt = "CALDRA",
}: CaldraLogoProps) {
  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center aspect-square overflow-hidden rounded-lg bg-[#040914] select-none",
        className,
      )}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }}
    >
      <img
        src={CALDRA_LOGO_SRC}
        alt={alt}
        draggable={false}
        decoding="async"
        className="size-full aspect-square object-contain select-none pointer-events-none"
      />
    </div>
  );
}

/** Marca oficial do CALDRA compatível com o design system existente. */
export function CaldraMark({ className }: { className?: string }) {
  return <CaldraLogo className={cn("rounded-xl", className)} size="100%" />;
}

/** Alias de compatibilidade com módulos chameleon. */
export function ChameleonMark({ className }: { className?: string }) {
  return <CaldraLogo className={cn("rounded-xl", className)} size="100%" />;
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 leading-tight">
      <CaldraLogo size={compact ? 24 : 32} className="rounded-lg" />
      <div className="min-w-0">
        <p className="font-display text-[15px] font-bold tracking-wider whitespace-nowrap bg-gradient-to-r from-foreground via-foreground to-accent bg-clip-text text-transparent">
          CALDRA
        </p>
        {!compact && (
          <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
            ENGENHARIA EM FORMA
          </p>
        )}
      </div>
    </div>
  );
}
