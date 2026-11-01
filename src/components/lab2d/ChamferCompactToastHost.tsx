import React, { useEffect, useState } from "react";
import { Check, Info, AlertTriangle, AlertCircle, X } from "lucide-react";
import {
  subscribeNotifications,
  getNotificationState,
  dismissNotification,
  clearAllNotifications,
  pauseNotificationTimer,
  resumeNotificationTimer,
  type ActiveChamferNotification,
  type ChamferNotificationType,
} from "@/lib/lab2d/chamferNotify";
import type { ChamferResolvedThemeMode } from "@/components/lab2d/useIntentTheme";

export interface ChamferToastVisualTokens {
  background: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  boxShadow: string;
  backdropFilter: string;
}

export function getChamferToastVisualTokens(
  mode: ChamferResolvedThemeMode,
): ChamferToastVisualTokens {
  if (mode === "amoled") {
    return {
      background: "rgba(10, 15, 21, 0.94)",
      border: "1px solid #1E2A38",
      textPrimary: "#E6EDF3",
      textSecondary: "#9AABBA",
      boxShadow: "0 6px 22px rgba(0, 0, 0, 0.65)",
      backdropFilter: "blur(10px)",
    };
  }
  if (mode === "light") {
    return {
      background: "rgba(255, 255, 255, 0.94)",
      border: "1px solid rgba(15, 23, 42, 0.10)",
      textPrimary: "#0F172A",
      textSecondary: "#475569",
      boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
      backdropFilter: "blur(10px)",
    };
  }
  return {
    background: "rgba(32, 45, 59, 0.94)",
    border: "1px solid var(--chamfer-toast-border, #344456)",
    textPrimary: "#DCE5ED",
    textSecondary: "#9AABBA",
    boxShadow: "0 6px 20px rgba(6, 10, 17, 0.42)",
    backdropFilter: "blur(10px)",
  };
}

export function getChamferToastStatusColor(
  tipo: ChamferNotificationType,
  accentColor?: string,
): string {
  switch (tipo) {
    case "sucesso":
      return "#50C49B";
    case "aviso":
      return "#E4B36B";
    case "erro":
      return "#E66F78";
    case "informacao":
    default:
      return accentColor || "var(--chamfer-accent-primary, var(--chamfer-accent, #51B8DD))";
  }
}

export interface ChamferToastViewportLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  isLandscape: boolean;
  hasTopCommandBanner?: boolean;
  hasTwoLines?: boolean;
}

export interface ChamferToastViewportRects {
  topBarRect: { top: number; bottom: number; left: number; right: number; height: number };
  rulerRect: { top: number; bottom: number; left: number; right: number; height: number };
  toastRect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
  overlapsTopBar: boolean;
  clearanceBelowRulerPx: number;
}

export function computeChamferToastAnchorRect(
  input: ChamferToastViewportLayoutInput,
): ChamferToastViewportRects {
  const topBarHeight = 48;
  const rulerHeight = input.isLandscape ? 26 : 20;
  const clearanceBelowRulerPx = 8 + (input.hasTopCommandBanner ? 44 : 0);

  const topBarRect = {
    top: 0,
    bottom: topBarHeight,
    left: 0,
    right: input.viewportWidth,
    height: topBarHeight,
  };

  const rulerRect = {
    top: topBarHeight,
    bottom: topBarHeight + rulerHeight,
    left: 0,
    right: input.viewportWidth,
    height: rulerHeight,
  };

  const maxAllowedW = Math.min(Math.round(input.viewportWidth * 0.92), 440);
  const pillW = Math.min(maxAllowedW, 320);
  const pillH = input.hasTwoLines ? 44 : 36;
  const toastTop = rulerRect.bottom + clearanceBelowRulerPx;
  const toastLeft = Math.round((input.viewportWidth - pillW) / 2);

  const toastRect = {
    top: toastTop,
    bottom: toastTop + pillH,
    left: toastLeft,
    right: toastLeft + pillW,
    width: pillW,
    height: pillH,
  };

  return {
    topBarRect,
    rulerRect,
    toastRect,
    overlapsTopBar: toastRect.top < topBarRect.bottom,
    clearanceBelowRulerPx,
  };
}

export interface ChamferCompactToastHostProps {
  themeMode: ChamferResolvedThemeMode;
  accentColor?: string;
  isLandscape: boolean;
  hasTopCommandBanner?: boolean;
}

export const ChamferCompactToastHost: React.FC<ChamferCompactToastHostProps> = ({
  themeMode,
  accentColor,
  isLandscape,
  hasTopCommandBanner = false,
}) => {
  const [active, setActive] = useState<ActiveChamferNotification | null>(
    () => getNotificationState().active,
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  useEffect(() => {
    const unsubscribe = subscribeNotifications((state) => {
      setActive(state.active);
    });
    return () => {
      unsubscribe();
      clearAllNotifications();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearAllNotifications();
    };
  }, [isLandscape]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const rulerHeightPx = isLandscape ? 26 : 20;
  const topOffsetPx = rulerHeightPx + 8 + (hasTopCommandBanner ? 44 : 0);
  const visualTokens = getChamferToastVisualTokens(themeMode);

  if (!active) {
    return null;
  }

  const statusColor = getChamferToastStatusColor(active.tipo, accentColor);
  const hasDetail = Boolean(active.mensagem && active.mensagem.trim().length > 0);
  const isInteractive = active.interactive;

  const renderStatusIcon = () => {
    const iconProps = {
      style: { color: statusColor, width: 16, height: 16 },
      className: "shrink-0",
      "aria-hidden": true as const,
    };
    switch (active.tipo) {
      case "sucesso":
        return <Check {...iconProps} strokeWidth={2.5} />;
      case "aviso":
        return <AlertTriangle {...iconProps} strokeWidth={2.2} />;
      case "erro":
        return <AlertCircle {...iconProps} strokeWidth={2.2} />;
      case "informacao":
      default:
        return <Info {...iconProps} strokeWidth={2.2} />;
    }
  };

  return (
    <div
      data-testid="chamfer-compact-toast-host"
      style={{
        position: "absolute",
        top: `${topOffsetPx}px`,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 35,
        pointerEvents: "none",
        maxWidth: "min(92vw, 440px)",
        width: "max-content",
      }}
      className="flex justify-center select-none"
    >
      <div
        key={active.id}
        data-testid="chamfer-compact-toast-pill"
        data-toast-type={active.tipo}
        role={active.ariaRole}
        aria-live={active.ariaLive}
        aria-atomic="true"
        onMouseEnter={isInteractive ? pauseNotificationTimer : undefined}
        onMouseLeave={isInteractive ? resumeNotificationTimer : undefined}
        onFocus={isInteractive ? pauseNotificationTimer : undefined}
        onBlur={isInteractive ? resumeNotificationTimer : undefined}
        onTouchStart={isInteractive ? pauseNotificationTimer : undefined}
        onTouchEnd={isInteractive ? resumeNotificationTimer : undefined}
        style={{
          pointerEvents: isInteractive ? "auto" : "none",
          backgroundColor: visualTokens.background,
          border: visualTokens.border,
          color: visualTokens.textPrimary,
          boxShadow: visualTokens.boxShadow,
          backdropFilter: visualTokens.backdropFilter,
          WebkitBackdropFilter: visualTokens.backdropFilter,
          borderRadius: "18px",
          minHeight: "36px",
          padding: "6px 14px",
          maxWidth: "min(92vw, 440px)",
          transition: prefersReducedMotion
            ? "opacity 80ms linear"
            : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative flex items-center gap-2.5 overflow-hidden"
      >
        <span
          aria-hidden="true"
          style={{
            backgroundColor: statusColor,
            width: "2px",
            height: hasDetail ? "22px" : "16px",
            borderRadius: "999px",
          }}
          className="shrink-0"
        />

        {renderStatusIcon()}

        <div className="flex min-w-0 flex-col justify-center leading-tight">
          <span
            data-testid="chamfer-toast-title"
            style={{
              color: visualTokens.textPrimary,
              fontSize: "12.5px",
              fontWeight: 600,
              lineHeight: hasDetail ? "15px" : "20px",
            }}
            className="truncate"
          >
            {active.titulo}
          </span>
          {hasDetail && (
            <span
              data-testid="chamfer-toast-detail"
              style={{
                color: visualTokens.textSecondary,
                fontSize: "12px",
                fontWeight: 400,
                lineHeight: "15px",
              }}
              className="truncate"
            >
              {active.mensagem}
            </span>
          )}
        </div>

        {active.acao && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              active.acao?.onClick();
              dismissNotification(active.id);
            }}
            style={{
              color: statusColor,
              borderColor: "var(--chamfer-border, #344456)",
              fontSize: "12px",
              fontWeight: 600,
            }}
            className="ml-1 flex min-h-[32px] min-w-[44px] shrink-0 items-center justify-center rounded-full border px-2.5 py-0.5 transition-opacity hover:opacity-90 cursor-pointer"
          >
            {active.acao.rotulo}
          </button>
        )}

        {(active.tipo === "erro" || active.persistente) && (
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={(e) => {
              e.stopPropagation();
              dismissNotification(active.id);
            }}
            style={{ color: visualTokens.textSecondary }}
            className="-mr-2 ml-0.5 flex min-h-[32px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-colors hover:opacity-100 opacity-80 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
