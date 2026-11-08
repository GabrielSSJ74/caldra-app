import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface NavigationAreaHeaderProps {
  /** Texto da etiqueta superior em letras maiúsculas (ex: "SUA OFICINA DIGITAL", "PROJETO TÉCNICO & CAD", etc.) */
  badgeText: string;
  /** Cor do texto da etiqueta (ex: "text-amber-500", "text-sky-500", "text-emerald-500", "text-indigo-400") */
  badgeColor?: string;
  /** Cor do indicador visual pulsante à esquerda (ex: "bg-amber-500", "bg-sky-500", "bg-emerald-500", "bg-indigo-400") */
  indicatorColor?: string;
  /** Tag secundária opcional contextual (ex: "CALDRA LAB", "PRO", etc.) */
  secondaryBadge?: ReactNode;
  /** Título principal com a escala tipográfica padrão de Perfil e Conta */
  title: ReactNode;
  /** Descrição explicativa curta com a escala tipográfica padrão de Perfil e Conta */
  description?: ReactNode;
  /** Elemento visual ou logotipo opcional à esquerda (ex: CaldraLogo na Home) */
  leadingVisual?: ReactNode;
  /** Controles ou ações contextuais opcionais no canto direito */
  actions?: ReactNode;
  /** Se deve exibir a linha divisória inferior sutil (padrão: true) */
  showDivider?: boolean;
  /** Classes adicionais para o container do cabeçalho */
  className?: string;
}

/**
 * Cabeçalho padronizado global para as áreas principais de navegação do CALDRA:
 * - Início
 * - Projetar
 * - Produzir
 * - Aprenda
 * - Perfil e Conta (modelo de referência)
 *
 * Reproduz com exatidão a hierarquia tipográfica, os espaçamentos, o indicador visual,
 * a escala de texto e a linha divisória estrutural de Perfil e Conta.
 */
export function NavigationAreaHeader({
  badgeText,
  badgeColor = "text-amber-500",
  indicatorColor = "bg-amber-500",
  secondaryBadge,
  title,
  description,
  leadingVisual,
  actions,
  showDivider = true,
  className,
}: NavigationAreaHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1",
        showDivider && "border-b border-border/40 pb-3",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {leadingVisual && <div className="shrink-0 mt-0.5">{leadingVisual}</div>}
        <div className="min-w-0 flex-1">
          {/* 1. Identificador superior em linha única com indicador pulsante, subtítulo e badge */}
          <div className="flex items-center gap-2 flex-nowrap min-w-0">
            <span
              className={cn("size-2 rounded-full animate-pulse shrink-0", indicatorColor)}
              aria-hidden="true"
            />
            <span
              className={cn(
                "font-mono text-[10.5px] font-bold tracking-[0.06em] sm:tracking-[0.14em] uppercase whitespace-nowrap truncate",
                badgeColor,
              )}
            >
              {badgeText}
            </span>
            {secondaryBadge}
          </div>

          {/* 2. Título principal unificado em linha única */}
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-0.5 leading-tight whitespace-nowrap">
            {title}
          </h1>

          {/* 3. Descrição curta e objetiva */}
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* 4. Ações contextuais alinhadas à direita */}
      {actions && (
        <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
