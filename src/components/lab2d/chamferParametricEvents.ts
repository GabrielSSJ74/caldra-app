/**
 * CALDRA CHAMFER — BARRAMENTO DE EVENTOS DOS INSTRUMENTOS PARAMÉTRICOS
 *
 * Permite que as barras nativas já estabelecidas (Header Superior, Barra Lateral PRE/CHP/3D,
 * Barra Inferior de Status, UI Retrato e Hub/Mesa PRUMO) abram/alternem as gavetas laterais
 * compactas e a faixa acoplada da Timeline com exclusividade estrita (zero sobreposição,
 * zero pílulas flutuantes soltas sobre o canvas).
 */

import { useEffect, useState } from "react";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";

export type ChamferParametricPanelId =
  | "none"
  | "parameters"
  | "sheet"
  | "section"
  | "constraints"
  | "sbox";

export type ChamferParametricAction =
  | Exclude<ChamferParametricPanelId, "none">
  | "timeline"
  | "close";

export interface ChamferParametricStatusSnapshot {
  activePanel: ChamferParametricPanelId;
  timelineOpen: boolean;
  featureCount: number;
  rollbackActive: boolean;
  sectionEnabled: boolean;
}

export interface ChamferSheetMetal3DEventDetail {
  active: boolean;
  shape: CadTessellatedShape | null;
  label?: string;
}

export const CHAMFER_PARAMETRIC_ACTION_EVENT = "caldra:chamfer-parametric-action";
export const CHAMFER_PARAMETRIC_STATUS_EVENT = "caldra:chamfer-parametric-status";
export const CHAMFER_SHEET_METAL_3D_EVENT = "caldra:chamfer-sheet-metal-3d";

export function broadcastChamferSheetMetal3D(detail: ChamferSheetMetal3DEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChamferSheetMetal3DEventDetail>(CHAMFER_SHEET_METAL_3D_EVENT, {
      detail,
    }),
  );
}

let latestStatus: ChamferParametricStatusSnapshot = {
  activePanel: "none",
  timelineOpen: false,
  featureCount: 1,
  rollbackActive: false,
  sectionEnabled: false,
};

export function dispatchChamferParametricPanel(
  action: ChamferParametricAction,
  options?: { toggle?: boolean },
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHAMFER_PARAMETRIC_ACTION_EVENT, {
      detail: { action, toggle: options?.toggle ?? true },
    }),
  );
}

export function broadcastChamferParametricStatus(
  snapshot: ChamferParametricStatusSnapshot,
): void {
  latestStatus = snapshot;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChamferParametricStatusSnapshot>(CHAMFER_PARAMETRIC_STATUS_EVENT, {
      detail: snapshot,
    }),
  );
}

export function useChamferParametricStatus(): ChamferParametricStatusSnapshot {
  const [status, setStatus] = useState<ChamferParametricStatusSnapshot>(latestStatus);

  useEffect(() => {
    setStatus(latestStatus);
    if (typeof window === "undefined") return;
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<ChamferParametricStatusSnapshot>).detail;
      if (detail) setStatus(detail);
    };
    window.addEventListener(CHAMFER_PARAMETRIC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(CHAMFER_PARAMETRIC_STATUS_EVENT, onStatus);
  }, []);

  return status;
}
