/**
 * CALDRA CHAMFER — ORQUESTRADOR PARAMÉTRICO UNIFICADO (PILARES 1–8)
 *
 * - ZERO pílulas flutuantes soltas sobre o canvas: todos os gatilhos moram integrados nas barras
 *   já estabelecidas do CHAMFER (Barra Superior, Barra Lateral PRE/CHP/3D, Barra Inferior de Status,
 *   UI Retrato e Hub/Mesa PRUMO) via `chamferParametricEvents`.
 * - Regra estrita de exclusividade (1 painel por vez): abrir qualquer Gaveta Lateral Direita
 *   (`fx Parâmetros`, `Chapa`, `Seção`, `Restrições`, `Busca`) recolhe automaticamente a Timeline,
 *   e expandir a faixa fina da Timeline fecha qualquer gaveta aberta.
 * - Cada instrumento isolado em seu próprio ErrorBoundary.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entity } from "@/lib/lab2d/core";
import {
  createChamferParametricEngine,
  createEmptyParametricDocument,
  STEEL_DENSITY_KG_M3,
  type ParametricDocumentState,
  type TimelineFeatureNode,
} from "@/chamfer/core/timelineEvaluator";
import {
  solveSketch2D,
  autoConstrainSketch,
  type ParametricSketch2D,
  type SketchConstraintType,
} from "@/chamfer/sketch/constraintSolver";
import { projectCurrentViewToDxf } from "@/chamfer/inspect/sectionAndInspect";
import { ChamferInstrumentErrorBoundary } from "./ChamferInstrumentErrorBoundary";
import { ChamferParametricTimelineBar } from "./ChamferParametricTimelineBar";
import { ChamferParametersSheet } from "./ChamferParametersSheet";
import {
  ChamferParametricSuiteDrawer,
  type ParametricSuiteTab,
} from "./ChamferParametricSuiteDrawer";
import { ChamferRadialMenu, type Radial3DContextKind } from "./ChamferRadialMenu";
import {
  CHAMFER_PARAMETRIC_ACTION_EVENT,
  broadcastChamferParametricStatus,
  type ChamferParametricAction,
  type ChamferParametricPanelId,
} from "./chamferParametricEvents";
import { triggerHaptic } from "@/lib/ui/haptics";

export const CHAMFER_SECTION_PLANE_EVENT = "caldra:chamfer-section-plane";

export interface ChamferSectionPlaneEventDetail {
  enabled: boolean;
  axis: "XY" | "XZ" | "YZ";
  offsetMm: number;
  flipped: boolean;
}

export interface ChamferParametricOrchestratorProps {
  entities: Entity[];
  selection: string[];
  thickness: number;
  activeMode: "2d" | "3d" | "flanges";
  onThicknessChange: (val: number) => void;
  onRunLegacyCommand?: (cmdId: string) => void;
  onNotify?: (msg: string) => void;
}

function deriveInitialDocFromEntities(
  entities: Entity[],
  thickness: number,
): ParametricDocumentState {
  const { engine } = createChamferParametricEngine(
    createEmptyParametricDocument(STEEL_DENSITY_KG_M3),
  );
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const circles: Array<{ cx: number; cy: number; r: number }> = [];

  for (const e of entities) {
    if (e.kind === "line") {
      minX = Math.min(minX, e.a.x, e.b.x);
      maxX = Math.max(maxX, e.a.x, e.b.x);
      minY = Math.min(minY, e.a.y, e.b.y);
      maxY = Math.max(maxY, e.a.y, e.b.y);
    } else if (e.kind === "circle") {
      minX = Math.min(minX, e.c.x - e.r);
      maxX = Math.max(maxX, e.c.x + e.r);
      minY = Math.min(minY, e.c.y - e.r);
      maxY = Math.max(maxY, e.c.y + e.r);
      circles.push({ cx: e.c.x, cy: e.c.y, r: e.r });
    } else if (e.kind === "rect") {
      minX = Math.min(minX, e.x, e.x + e.w);
      maxX = Math.max(maxX, e.x, e.x + e.w);
      minY = Math.min(minY, e.y, e.y + e.h);
      maxY = Math.max(maxY, e.y, e.y + e.h);
    }
  }

  const w = Number.isFinite(minX) && maxX - minX > 1 ? maxX - minX : 100;
  const d = Number.isFinite(minY) && maxY - minY > 1 ? maxY - minY : 60;
  const h = Math.max(1, thickness || 3);

  engine.runSafeCommand("solid.extrude", {
    id: "base_sketch_ext",
    name: "Base 2D → 3D",
    widthMm: Number(w.toFixed(2)),
    depthMm: Number(d.toFixed(2)),
    heightMm: Number(h.toFixed(2)),
  });

  const holeCircles = circles
    .filter((c) => c.r * 2 < Math.min(w, d) * 0.6)
    .slice(0, 6);
  holeCircles.forEach((hc, idx) => {
    engine.runSafeCommand("solid.hole", {
      id: `hole_auto_${idx + 1}`,
      diameterMm: Number((hc.r * 2).toFixed(2)),
      through: true,
      targetFaceKey: "base_sketch_ext:top",
      targetBodyId: "base_sketch_ext",
    });
  });

  return engine.getState();
}

export function ChamferParametricOrchestrator({
  entities,
  selection,
  thickness,
  activeMode,
  onThicknessChange,
  onRunLegacyCommand,
  onNotify,
}: ChamferParametricOrchestratorProps) {
  // Regra de Exclusividade Estrita: apenas 1 Gaveta Lateral Direita OU a faixa da Timeline aberta por vez
  const [activeSheet, setActiveSheet] = useState<ChamferParametricPanelId>("none");
  const [timelineOpen, setTimelineOpen] = useState(false);

  const engineBundleRef = useRef<ReturnType<typeof createChamferParametricEngine> | null>(null);
  if (!engineBundleRef.current) {
    engineBundleRef.current = createChamferParametricEngine(
      deriveInitialDocFromEntities(entities, thickness),
    );
  }
  const [docState, setDocState] = useState<ParametricDocumentState>(() =>
    deriveInitialDocFromEntities(entities, thickness),
  );

  // Ressincroniza altura/espessura quando `thickness` do projeto muda
  useEffect(() => {
    setDocState((prev) => {
      const nextFeatures = prev.features.map((f) =>
        f.id === "base_sketch_ext"
          ? { ...f, params: { ...f.params, heightMm: Math.max(1, thickness) } }
          : f,
      );
      return engineBundleRef.current!.evaluator.evaluate({ ...prev, features: nextFeatures });
    });
  }, [thickness]);

  // Estado Section Analysis (Pilar 7) sincronizado com ThreeBRepRenderer
  const [sectionState, setSectionState] = useState<ChamferSectionPlaneEventDetail>({
    enabled: false,
    axis: "XY",
    offsetMm: 0,
    flipped: false,
  });

  const handleSectionChange = useCallback((next: ChamferSectionPlaneEventDetail) => {
    setSectionState(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ChamferSectionPlaneEventDetail>(CHAMFER_SECTION_PLANE_EVENT, {
          detail: next,
        }),
      );
    }
  }, []);

  // Escuta comandos disparados pelas barras nativas (Header, Sidebar PRE/CHP/3D, Status Bar, PRUMO)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: ChamferParametricAction; toggle?: boolean }>).detail;
      if (!detail) return;
      const { action, toggle = true } = detail;

      if (action === "close") {
        setActiveSheet("none");
        setTimelineOpen(false);
        return;
      }

      if (action === "timeline") {
        setActiveSheet("none");
        setTimelineOpen((cur) => (toggle ? !cur : true));
        return;
      }

      // Qualquer gaveta lateral direita fecha automaticamente a Timeline e substitui a gaveta anterior
      setTimelineOpen(false);
      setActiveSheet((cur) => (toggle && cur === action ? "none" : action));
    };

    window.addEventListener(CHAMFER_PARAMETRIC_ACTION_EVENT, onAction);
    return () => window.removeEventListener(CHAMFER_PARAMETRIC_ACTION_EVENT, onAction);
  }, []);

  // Publica status ao vivo para os botões embutidos nas barras nativas
  useEffect(() => {
    broadcastChamferParametricStatus({
      activePanel: activeSheet,
      timelineOpen,
      featureCount: docState.features.length,
      rollbackActive:
        docState.rollbackIndex !== null && docState.rollbackIndex < docState.features.length,
      sectionEnabled: sectionState.enabled,
    });
  }, [activeSheet, timelineOpen, docState.features.length, docState.rollbackIndex, sectionState.enabled]);

  // Estado do Solver 2D & DOF (Pilar 3)
  const [sketchConflict, setSketchConflict] = useState<string | undefined>(undefined);
  const [extraConstraintsCount, setExtraConstraintsCount] = useState(0);

  const dofSummary = useMemo(() => {
    const lineEntities = entities.filter((e) => e.kind === "line").slice(0, 12);
    const pts: ParametricSketch2D["points"] = [];
    const lines: ParametricSketch2D["lines"] = [];
    lineEntities.forEach((l, idx) => {
      if (l.kind !== "line") return;
      const aId = `p_${idx}_a`;
      const bId = `p_${idx}_b`;
      pts.push({ id: aId, x: l.a.x, y: l.a.y, fixed: idx === 0 });
      pts.push({ id: bId, x: l.b.x, y: l.b.y });
      lines.push({ id: l.id, p1: aId, p2: bId });
    });
    if (pts.length === 0) {
      return {
        dof: 0,
        statusLabel: "Esboço pronto (adicione linhas)",
        conflictMessage: sketchConflict,
      };
    }
    const solved = solveSketch2D({ points: pts, lines, circles: [], constraints: [] });
    const adjDof = Math.max(0, solved.dof - extraConstraintsCount);
    return {
      dof: adjDof,
      statusLabel: adjDof === 0 ? "✓ Totalmente Definido" : `Livre (${adjDof} GDL)`,
      conflictMessage: sketchConflict,
    };
  }, [entities, extraConstraintsCount, sketchConflict]);

  // Menu Radial 3D por toque longo (380ms sem arrastar — Pilar 8)
  const [radial3D, setRadial3D] = useState<{
    open: boolean;
    pos: { x: number; y: number };
    context: Radial3DContextKind;
  }>({ open: false, pos: { x: 0, y: 0 }, context: "face" });
  const [normalFlipped, setNormalFlipped] = useState(false);

  useEffect(() => {
    if (activeMode !== "3d") {
      setRadial3D((prev) => (prev.open ? { ...prev, open: false } : prev));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName.toLowerCase() !== "canvas") return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        triggerHaptic("heavy");
        setRadial3D({
          open: true,
          pos: { x: startX, y: startY },
          context: "face",
        });
      }, 380);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!timer) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", clear, { passive: true });
    window.addEventListener("pointercancel", clear, { passive: true });
    return () => {
      clear();
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [activeMode]);

  const handleTimelineMutate = useCallback(
    (mutate: (prev: ParametricDocumentState) => ParametricDocumentState) => {
      setDocState((prev) => engineBundleRef.current!.evaluator.evaluate(mutate(prev)));
    },
    [],
  );

  const handleExportCurrentViewDxf = useCallback(
    (includeHidden: boolean) => {
      const edges3D: Array<{
        a: { x: number; y: number; z: number };
        b: { x: number; y: number; z: number };
        hidden?: boolean;
      }> = [];
      const circles3D: Array<{
        center: { x: number; y: number; z: number };
        radius: number;
        normal: { x: number; y: number; z: number };
      }> = [];

      for (const e of entities) {
        if (e.kind === "line") {
          edges3D.push({ a: { x: e.a.x, y: e.a.y, z: 0 }, b: { x: e.b.x, y: e.b.y, z: 0 } });
          edges3D.push({
            a: { x: e.a.x, y: e.a.y, z: thickness },
            b: { x: e.b.x, y: e.b.y, z: thickness },
            hidden: true,
          });
        } else if (e.kind === "circle") {
          circles3D.push({
            center: { x: e.c.x, y: e.c.y, z: thickness },
            radius: e.r,
            normal: { x: 0, y: 0, z: 1 },
          });
        } else if (e.kind === "rect") {
          const corners = [
            { x: e.x, y: e.y, z: 0 },
            { x: e.x + e.w, y: e.y, z: 0 },
            { x: e.x + e.w, y: e.y + e.h, z: 0 },
            { x: e.x, y: e.y + e.h, z: 0 },
          ];
          for (let i = 0; i < 4; i++) {
            edges3D.push({ a: corners[i]!, b: corners[(i + 1) % 4]! });
          }
        }
      }

      const dxf = projectCurrentViewToDxf(
        edges3D,
        { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, viewDir: { x: 0, y: 0, z: 1 } },
        { includeHiddenLines: includeHidden, circles: circles3D },
      );

      const blob = new Blob([dxf], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vista_atual_1_1.dxf";
      a.click();
      URL.revokeObjectURL(url);
    },
    [entities, thickness],
  );

  const selectionCounts = useMemo(() => {
    const selSet = new Set(selection);
    let lines = 0;
    let circles = 0;
    for (const e of entities) {
      if (!selSet.has(e.id)) continue;
      if (e.kind === "line") lines++;
      else if (e.kind === "circle") circles++;
    }
    return { points: 0, lines: lines || 2, circles };
  }, [entities, selection]);

  const massSummary = {
    volumeCm3: docState.totalMassProps.volumeCm3,
    areaCm2: docState.totalMassProps.surfaceAreaMm2 / 100,
    massKg: docState.totalMassProps.massKg,
    centerZMm: docState.totalMassProps.centerOfMass.z,
  };

  const suiteOpen =
    activeSheet === "sheet" ||
    activeSheet === "section" ||
    activeSheet === "constraints" ||
    activeSheet === "sbox";

  return (
    <>
      {/* FAIXA HORIZONTAL FINA DA TIMELINE ACOPLADA ACIMA DA BARRA INFERIOR (FECHADA POR PADRÃO) */}
      <ChamferInstrumentErrorBoundary instrumentName="Timeline Paramétrica">
        <ChamferParametricTimelineBar
          open={timelineOpen}
          onClose={() => setTimelineOpen(false)}
          features={docState.features}
          rollbackIndex={docState.rollbackIndex}
          onRollbackChange={(idx) =>
            handleTimelineMutate((prev) => ({ ...prev, rollbackIndex: idx }))
          }
          onToggleSuppress={(nodeId) =>
            handleTimelineMutate((prev) => ({
              ...prev,
              features: prev.features.map((f) =>
                f.id === nodeId ? { ...f, suppressed: !f.suppressed } : f,
              ),
            }))
          }
          onRenameFeature={(nodeId, newName) =>
            handleTimelineMutate((prev) => ({
              ...prev,
              features: prev.features.map((f) =>
                f.id === nodeId ? { ...f, name: newName } : f,
              ),
            }))
          }
          onReorderFeature={(nodeId, dir) =>
            handleTimelineMutate((prev) => {
              const idx = prev.features.findIndex((f) => f.id === nodeId);
              const nextIdx = idx + dir;
              if (idx < 0 || nextIdx < 0 || nextIdx >= prev.features.length) return prev;
              const arr = [...prev.features];
              const [item] = arr.splice(idx, 1);
              arr.splice(nextIdx, 0, item!);
              return { ...prev, features: arr };
            })
          }
          onDeleteFeature={(nodeId) =>
            handleTimelineMutate((prev) => ({
              ...prev,
              features: prev.features.filter((f) => f.id !== nodeId),
            }))
          }
          onReattachReference={(nodeId) => {
            handleTimelineMutate((prev) => ({
              ...prev,
              features: prev.features.map((f: TimelineFeatureNode) =>
                f.id === nodeId
                  ? { ...f, targetFaceKey: "base_sketch_ext:top", missingReferenceWarning: undefined }
                  : f,
              ),
            }));
            onNotify?.("Referência topológica re-associada à face superior.");
          }}
          getDependents={(nodeId) =>
            engineBundleRef.current!.evaluator.getDependents(docState, nodeId)
          }
        />
      </ChamferInstrumentErrorBoundary>

      {/* GAVETA LATERAL DIREITA: PARÂMETROS & VARIANTES */}
      <ChamferInstrumentErrorBoundary instrumentName="Parâmetros & Configurações">
        <ChamferParametersSheet
          open={activeSheet === "parameters"}
          onClose={() => setActiveSheet("none")}
          onParameterApplied={(name, val) => {
            if (name === "chapa" && val >= 0.5 && val <= 100) {
              onThicknessChange(val);
            }
          }}
          onConfigurationApplied={(cfgName) => {
            onNotify?.(`Configuração aplicada: ${cfgName}`);
          }}
        />
      </ChamferInstrumentErrorBoundary>

      {/* GAVETA LATERAL DIREITA: CHAPA / SEÇÃO / RESTRIÇÕES / BUSCA */}
      <ChamferInstrumentErrorBoundary instrumentName="Suite Paramétrica">
        <ChamferParametricSuiteDrawer
          open={suiteOpen}
          initialTab={suiteOpen ? (activeSheet as ParametricSuiteTab) : "sheet"}
          onClose={() => setActiveSheet("none")}
          sectionState={sectionState}
          onSectionChange={handleSectionChange}
          massSummary={massSummary}
          onExportCurrentViewDxf={handleExportCurrentViewDxf}
          dofInfo={dofSummary}
          selectionCounts={selectionCounts}
          activeThicknessMm={thickness}
          onSheetRuleThicknessChange={onThicknessChange}
          onApplyConstraint={(type: SketchConstraintType) => {
            setSketchConflict(undefined);
            setExtraConstraintsCount((c) => c + 1);
            onNotify?.(`Restrição "${type}" aplicada ao esboço.`);
          }}
          onAutoConstrain={() => {
            const lineEntities = entities.filter((e) => e.kind === "line").slice(0, 12);
            const pts: ParametricSketch2D["points"] = [];
            const lines: ParametricSketch2D["lines"] = [];
            lineEntities.forEach((l, idx) => {
              if (l.kind !== "line") return;
              pts.push({ id: `p${idx}a`, x: l.a.x, y: l.a.y });
              pts.push({ id: `p${idx}b`, x: l.b.x, y: l.b.y });
              lines.push({ id: l.id, p1: `p${idx}a`, p2: `p${idx}b` });
            });
            const autoRes = autoConstrainSketch({ points: pts, lines, circles: [], constraints: [] });
            setExtraConstraintsCount((c) => c + autoRes.addedConstraints.length);
            onNotify?.(
              `Autorrestringir inferiu ${autoRes.addedConstraints.length} restrição(ões) (${autoRes.solveResult.statusLabel}).`,
            );
          }}
          onRunQuickCommand={(cmdId) => {
            if (cmdId === "parameters.open") {
              setTimelineOpen(false);
              setActiveSheet("parameters");
            } else if (cmdId === "timeline.open") {
              setActiveSheet("none");
              setTimelineOpen(true);
            } else if (cmdId === "inspect.section") {
              handleSectionChange({ ...sectionState, enabled: true });
              setTimelineOpen(false);
              setActiveSheet("section");
            } else if (cmdId === "inspect.viewToDxf") {
              handleExportCurrentViewDxf(false);
            } else if (cmdId.startsWith("sheet.")) {
              setTimelineOpen(false);
              setActiveSheet("sheet");
            } else {
              onRunLegacyCommand?.(cmdId);
            }
          }}
        />
      </ChamferInstrumentErrorBoundary>

      {/* MENU RADIAL 3D POR TOQUE LONGO 380ms */}
      <ChamferInstrumentErrorBoundary instrumentName="Menu Radial 3D">
        <ChamferRadialMenu
          open={radial3D.open}
          position={radial3D.pos}
          context3D={activeMode === "3d" ? radial3D.context : null}
          normalFlipped={normalFlipped}
          onClose={() => setRadial3D((prev) => ({ ...prev, open: false }))}
          onAction={(actionId) => {
            if (actionId === "normal_to_face") {
              setNormalFlipped((f) => !f);
              onNotify?.(
                normalFlipped
                  ? "Câmera alinhada Normal à Face (0°)."
                  : "Câmera invertida Normal à Face (180°).",
              );
            } else if (actionId === "section_here") {
              handleSectionChange({ ...sectionState, enabled: true });
              setTimelineOpen(false);
              setActiveSheet("section");
            } else if (actionId === "edge_flange") {
              setTimelineOpen(false);
              setActiveSheet("sheet");
            } else if (actionId === "edit_feature") {
              setActiveSheet("none");
              setTimelineOpen(true);
            } else {
              onRunLegacyCommand?.(actionId);
            }
          }}
        />
      </ChamferInstrumentErrorBoundary>
    </>
  );
}
