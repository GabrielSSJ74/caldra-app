/**
 * CALDRA CHAMFER — ERROR BOUNDARY INDEPENDENTE POR INSTRUMENTO (PILAR 1)
 *
 * Isola cada painel periférico (Timeline, Parâmetros, Mini-Calculadora, Chapa Metálica,
 * Seção/Inspeção, Busca Rápida) para que nenhuma falha de UI derrube o canvas 2D/3D.
 */

import React from "react";

interface Props {
  instrumentName: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ChamferInstrumentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || "Erro inesperado no instrumento",
    };
  }

  override componentDidCatch(error: Error) {
    console.error(`[CHAMFER:${this.props.instrumentName}] Falha isolada:`, error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            backgroundColor: "var(--chamfer-popover-bg)",
            borderColor: "var(--chamfer-status-error)",
            color: "var(--chamfer-status-error)",
            boxShadow: "var(--chamfer-toast-shadow)",
          }}
          className="fixed bottom-12 right-3 z-[120] flex max-w-[300px] items-center gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur-md"
        >
          <span className="font-semibold">{this.props.instrumentName}:</span>
          <span className="truncate opacity-80">{this.state.errorMessage}</span>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: "" })}
            style={{
              backgroundColor: "var(--chamfer-accent)",
              color: "var(--chamfer-accent-contrast)",
            }}
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer"
          >
            Recuperar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
