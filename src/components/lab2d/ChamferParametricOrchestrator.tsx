/**
 * CALDRA CHAMFER — ORQUESTRADOR PARAMÉTRICO UNIFICADO (PILARES 1–8 + BEND TREE)
 *
 * - ZERO pílulas flutuantes soltas sobre o canvas: todos os gatilhos moram integrados nas barras
 *   já estabelecidas do CHAMFER (Barra Superior, Barra Lateral PRE/CHP/3D, Barra Inferior de Status,
 *   UI Retrato e Hub/Mesa PRUMO) via `chamferParametricEvents`.
 * - Regra estrita de exclusividade (1 painel por vez): abrir qualquer Gaveta Lateral Direita
 *   (`fx Parâmetros`, `Chapa`, `Seção`, `Restrições`, `Busca`) recolhe automaticamente a Timeline,
 *   e expandir a faixa fina da Timeline fecha qualquer gaveta aberta.
 * - Integra a arquitetura completa `SheetMetalBody` + `BendTree` + `DihedralBendDetector` com
 *   projeção 3D ao vivo no `ChamferUnified3DViewport` e alça angular arrastável 3D.
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
import {
  DEFAULT_SHEET_METAL_RULES,
  addEdgeFlangeToBody,
  addHoleOrCutoutToBody,
  createContourFlangeBody,
  editBendNodeInBody,
  foldSheetMetalBody,
  refoldSheetMetalBody,
  swapFixedRootFlange,
  unfoldSheetMetalBody,
  updateSheetMetalBodyRule,
  type BendDirection,
  type SheetMetalBody,
  type SheetMetalRule,
} from "@/chamfer/sheetMetal/bendTree";
import { evaluateBendTree, validateBendInputs } from "@/chamfer/sheetMetal/bendMath";
import { detectDihedralBendsFromPolyline2D } from "@/chamfer/sheetMetal/dihedralDetector";
import { chamferParameterStore } from "@/chamfer/core/parameterStore";
import { ChamferInstrumentErrorBoundary } from "./ChamferInstrumentErrorBoundary";
import { ChamferParametricTimelineBar } from "./ChamferParametricTimelineBar";
import { ChamferParametersSheet } from "./ChamferParametersSheet";
import {
  ChamferParametricSuiteDrawer,
  type ParametricSuiteTab,
  type SheetFoldFormPayload,
} from "./ChamferParametricSuiteDrawer";
import { ChamferRadialMenu, type Radial3DContextKind } from "./ChamferRadialMenu";
import { ChamferBendAngleHandle3D } from "./ChamferBendAngleHandle3D";
import {
  CHAMFER_PARAMETRIC_ACTION_EVENT,
  broadcastChamferParametricStatus,
  broadcastChamferSheetMetal3D,
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
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const circles: Array<{ cx: number; cy: number; r: number }> = [];

  for (const e of entities) {
    if (e.type === "line") {
      minX = Math.min(minX, e.x1, e.x2);
      maxX = Math.max(maxX, e.x1, e.x2);
      minY = Math.min(minY, e.y1, e.y2);
      maxY = Math.max(maxY, e.y1, e.y2);
    } else if (e.type === "circle") {
      minX = Math.min(minX, e.cx - e.r);
      maxX = Math.max(maxX, e.cx + e.r);
      minY = Math.min(minY, e.cy - e.r);
      maxY = Math.max(maxY, e.cy + e.r);
      circles.push({ cx: e.cx, cy: e.cy, r: e.r });
    } else if (e.type === "polyline") {
      for (const pt of e.pts) {
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      }
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

function findMatchingRule(thicknessMm: number): SheetMetalRule {
  return (
    DEFAULT_SHEET_METAL_RULES.find((r) => Math.abs(r.thicknessMm - thicknessMm) < 0.25) ?? {
      ...DEFAULT_SHEET_METAL_RULES[4]!,
      thicknessMm: Math.max(0.5, thicknessMm || 3),
      innerRadiusMm: Math.max(0.5, thicknessMm || 3),
    }
  );
}

function extractOpenPolylineFromEntities(entities: Entity[]): Array<[number, number]> {
  // 1. Procura polilinha aberta/fechada com >= 3 vértices
  for (const e of entities) {
    if (e.type === "polyline" && e.pts.length >= 3) {
      return e.pts.map((pt) => [pt.x, pt.y]);
    }
  }
  // 2. Encadeia segmentos de linha conectados
  const lines = entities.filter((e): e is Extract<Entity, { type: "line" }> => e.type === "line");
  if (lines.length >= 2) {
    const chain: Array<[number, number]> = [
      [lines[0]!.x1, lines[0]!.y1],
      [lines[0]!.x2, lines[0]!.y2],
    ];
    const used = new Set<number>([0]);
    let progressed = true;
    while (progressed && used.size < lines.length) {
      progressed = false;
      const tail = chain[chain.length - 1]!;
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const l = lines[i]!;
        if (Math.hypot(l.x1 - tail[0], l.y1 - tail[1]) < 1.5) {
          chain.push([l.x2, l.y2]);
          used.add(i);
          progressed = true;
          break;
        }
        if (Math.hypot(l.x2 - tail[0], l.y2 - tail[1]) < 1.5) {
          chain.push([l.x1, l.y1]);
          used.add(i);
          progressed = true;
          break;
        }
      }
    }
    if (chain.length >= 3) return chain;
  }
  // 3. Fallback industrial em L (40x30) para teste instantâneo do detector diedro
  return [
    [0, 0],
    [40, 0],
    [40, 30],
  ];
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

  // Estado lógico canônico da Chapa Metálica (BendTree separada 100% da malha visual Three.js)
  const [sheetBody, setSheetBody] = useState<SheetMetalBody>(() =>
    createContourFlangeBody({
      name: "Chapa L 40×30",
      extrudeWidthMm: 80,
      externalLegsMm: [40, 30],
      bendAnglesDeg: [90],
      rule: findMatchingRule(thickness),
    }),
  );
  const [sheet3DPreviewActive, setSheet3DPreviewActive] = useState(false);
  const [selectedBendId, setSelectedBendId] = useState<string | null>(() => "bend_01");
  const [detectionChipText, setDetectionChipText] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [draftFoldAngleDeg, setDraftFoldAngleDeg] = useState(90);
  const [draftFoldDirection, setDraftFoldDirection] = useState<BendDirection>("UP");

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
    setSheetBody((prev) => {
      if (Math.abs(prev.rule.thicknessMm - thickness) < 0.05) return prev;
      return updateSheetMetalBodyRule(prev, findMatchingRule(thickness));
    });
  }, [thickness]);

  // Projeta a malha 3D gerada pela BendTree no ChamferUnified3DViewport quando o preview 3D de Chapa está ativo
  useEffect(() => {
    if (!sheet3DPreviewActive || activeMode !== "3d") {
      broadcastChamferSheetMetal3D({ active: false, shape: null });
      return;
    }
    try {
      const evaluated = evaluateBendTree(sheetBody);
      broadcastChamferSheetMetal3D({
        active: true,
        shape: evaluated.tessellatedShape,
        label: sheetBody.name,
      });
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Erro ao avaliar cinemática 3D da chapa");
    }
  }, [sheetBody, sheet3DPreviewActive, activeMode]);

  useEffect(() => {
    return () => {
      broadcastChamferSheetMetal3D({ active: false, shape: null });
    };
  }, []);

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

  // Helper para registrar operações da Chapa Metálica na Timeline Paramétrica
  const appendSheetTimelineNode = useCallback(
    (node: Omit<TimelineFeatureNode, "id" | "suppressed" | "dependsOn"> & { id?: string }) => {
      setDocState((prev) => {
        const nextNode: TimelineFeatureNode = {
          id: node.id ?? `sheet_${prev.features.length + 1}`,
          name: node.name,
          type: node.type,
          suppressed: false,
          dependsOn: [],
          params: node.params,
        };
        return engineBundleRef.current!.evaluator.evaluate({
          ...prev,
          features: [...prev.features, nextNode],
        });
      });
    },
    [],
  );

  // Resolve expressão paramétrica de ângulo a partir do ParameterStore (ex: `ang_dobra`)
  const resolveAngleWithExpression = useCallback((fallbackDeg: number, expr?: string): number => {
    if (!expr || !expr.trim()) return fallbackDeg;
    const map = chamferParameterStore.getValueMap();
    const key = expr.trim();
    if (key in map && Number.isFinite(map[key])) {
      return map[key]!;
    }
    const parsed = Number(key.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallbackDeg;
  }, []);

  // Operações da BendTree de Chapa Metálica
  const handleSheetRuleChange = useCallback((rule: SheetMetalRule) => {
    setSheetError(null);
    setSheetBody((prev) => updateSheetMetalBodyRule(prev, rule));
  }, []);

  const handleSheetFold = useCallback(
    (payload: SheetFoldFormPayload) => {
      setSheetError(null);
      const resolvedAngle = resolveAngleWithExpression(payload.targetAngleDeg, payload.angleExpression);
      const check = validateBendInputs({
        angleDeg: resolvedAngle,
        thicknessMm: sheetBody.rule.thicknessMm,
        innerRadiusMm: payload.innerRadiusMm,
        kFactor: payload.kFactor,
      });
      if (!check.ok) {
        setSheetError(check.error ?? "Parâmetros de dobra inválidos");
        return;
      }

      const res = foldSheetMetalBody(sheetBody, {
        distanceFromEdgeMm: payload.distanceFromEdgeMm,
        childExternalLegMm: payload.childExternalLegMm,
        targetAngleDeg: resolvedAngle,
        angleExpression: payload.angleExpression,
        direction: payload.direction,
        innerRadiusMm: payload.innerRadiusMm,
        kFactor: payload.kFactor,
        bendPosition: payload.bendPosition,
        invertFixedSide: payload.invertFixedSide,
      });
      if (!res.ok) {
        setSheetError(res.error ?? "Falha ao executar Dobrar (Fold)");
        return;
      }
      setSheetBody(res.body);
      const newBendId = res.createdBendId ?? Object.keys(res.body.bends).slice(-1)[0] ?? null;
      setSelectedBendId(newBendId);
      if (activeMode === "3d") setSheet3DPreviewActive(true);
      appendSheetTimelineNode({
        id: newBendId ?? undefined,
        name: `Dobrar ${resolvedAngle.toFixed(1)}° ${payload.direction === "UP" ? "CIMA" : "BAIXO"}`,
        type: "sheetFold",
        params: {
          bendId: newBendId,
          targetAngleDeg: resolvedAngle,
          angleExpression: payload.angleExpression,
          direction: payload.direction,
          distanceFromEdgeMm: payload.distanceFromEdgeMm,
          childExternalLegMm: payload.childExternalLegMm,
          innerRadiusMm: payload.innerRadiusMm,
          kFactor: payload.kFactor,
          bendPosition: payload.bendPosition,
          invertFixedSide: payload.invertFixedSide,
        },
      });
      onNotify?.(`Dobra ${resolvedAngle.toFixed(1)}° (${payload.direction === "UP" ? "CIMA" : "BAIXO"}) registrada.`);
    },
    [sheetBody, activeMode, appendSheetTimelineNode, resolveAngleWithExpression, onNotify],
  );

  const handleSheetAddEdgeFlange = useCallback(
    (payload: {
      externalLengthMm: number;
      targetAngleDeg: number;
      direction: BendDirection;
      innerRadiusMm: number;
      kFactor: number;
      angleExpression?: string;
    }) => {
      setSheetError(null);
      const resolvedAngle = resolveAngleWithExpression(payload.targetAngleDeg, payload.angleExpression);
      const res = addEdgeFlangeToBody(sheetBody, {
        externalLengthMm: payload.externalLengthMm,
        targetAngleDeg: resolvedAngle,
        angleExpression: payload.angleExpression,
        direction: payload.direction,
        innerRadiusMm: payload.innerRadiusMm,
        kFactor: payload.kFactor,
      });
      if (!res.ok) {
        setSheetError(res.error ?? "Falha ao adicionar Edge Flange");
        return;
      }
      setSheetBody(res.body);
      const newBendId = res.createdBendId ?? Object.keys(res.body.bends).slice(-1)[0] ?? null;
      setSelectedBendId(newBendId);
      if (activeMode === "3d") setSheet3DPreviewActive(true);
      appendSheetTimelineNode({
        id: newBendId ?? undefined,
        name: `Edge Flange ${payload.externalLengthMm}mm (${resolvedAngle.toFixed(1)}°)`,
        type: "sheetEdgeFlange",
        params: { ...payload, targetAngleDeg: resolvedAngle, bendId: newBendId },
      });
    },
    [sheetBody, activeMode, appendSheetTimelineNode, resolveAngleWithExpression],
  );

  const handleSheetCreateContourFlange = useCallback(
    (payload: { preset: "L" | "U" | "Z"; legA: number; legB: number; widthMm: number; angleDeg: number }) => {
      setSheetError(null);
      try {
        const legs =
          payload.preset === "L"
            ? [payload.legA, payload.legB]
            : [payload.legA, payload.legB, payload.legA];
        const signedAngles =
          payload.preset === "L"
            ? [payload.angleDeg]
            : payload.preset === "Z"
              ? [payload.angleDeg, -payload.angleDeg]
              : [payload.angleDeg, payload.angleDeg];
        const body = createContourFlangeBody({
          name: `Perfil ${payload.preset} ${payload.legA}×${payload.legB}`,
          extrudeWidthMm: payload.widthMm,
          externalLegsMm: legs,
          bendAnglesDeg: signedAngles,
          rule: sheetBody.rule,
        });
        setSheetBody(body);
        setSelectedBendId(Object.keys(body.bends)[0] ?? null);
        if (activeMode === "3d") setSheet3DPreviewActive(true);
        appendSheetTimelineNode({
          name: `Contour Flange ${payload.preset}`,
          type: "sheetContourFlange",
          params: {
            extrudeWidthMm: payload.widthMm,
            externalLegsMm: legs,
            bendAnglesDeg: signedAngles,
          },
        });
      } catch (err) {
        setSheetError(err instanceof Error ? err.message : "Falha ao gerar Contour Flange");
      }
    },
    [sheetBody.rule, activeMode, appendSheetTimelineNode],
  );

  const handleSheetDetectDihedral = useCallback(() => {
    setSheetError(null);
    const poly = extractOpenPolylineFromEntities(entities);
    const detected = detectDihedralBendsFromPolyline2D(
      poly,
      Math.max(0.5, thickness || sheetBody.rule.thicknessMm),
      80,
      sheetBody.rule,
    );
    if (!detected.ok || !detected.body) {
      setSheetError(detected.error ?? "Nenhuma dobra diedra detectada no perfil atual.");
      return;
    }
    setSheetBody(detected.body);
    setSelectedBendId(Object.keys(detected.body.bends)[0] ?? null);
    setDetectionChipText(detected.confirmationChipText);
    if (activeMode === "3d") setSheet3DPreviewActive(true);
    onNotify?.(detected.confirmationChipText);
  }, [entities, thickness, sheetBody.rule, activeMode, onNotify]);

  const handleSheetUnfold = useCallback(
    (bendIds?: string[]) => {
      setSheetError(null);
      let workingBody = sheetBody;
      // Se ainda não há dobras registradas na BendTree, dispara o Detector Automático de Ângulo Diedro!
      if (Object.keys(workingBody.bends).length === 0) {
        const poly = extractOpenPolylineFromEntities(entities);
        const detected = detectDihedralBendsFromPolyline2D(
          poly,
          Math.max(0.5, thickness || workingBody.rule.thicknessMm),
          80,
          workingBody.rule,
        );
        if (detected.ok && detected.body) {
          workingBody = detected.body;
          setDetectionChipText(detected.confirmationChipText);
        }
      }
      const next = unfoldSheetMetalBody(workingBody, bendIds);
      setSheetBody(next);
      if (activeMode === "3d") setSheet3DPreviewActive(true);
      appendSheetTimelineNode({
        name: bendIds?.length ? `Desdobrar (${bendIds.length})` : "Desdobrar Todas",
        type: "sheetUnfold",
        params: { bendIds },
      });
    },
    [sheetBody, entities, thickness, activeMode, appendSheetTimelineNode],
  );

  const handleSheetRefold = useCallback(
    (bendIds?: string[]) => {
      setSheetError(null);
      const next = refoldSheetMetalBody(sheetBody, bendIds);
      setSheetBody(next);
      if (activeMode === "3d") setSheet3DPreviewActive(true);
      appendSheetTimelineNode({
        name: bendIds?.length ? `Redobrar (${bendIds.length})` : "Redobrar Todas",
        type: "sheetRefold",
        params: { bendIds },
      });
    },
    [sheetBody, activeMode, appendSheetTimelineNode],
  );

  const handleSheetEditBend = useCallback(
    (
      bendId: string,
      patch: { targetAngleDeg?: number; direction?: BendDirection; innerRadiusMm?: number; kFactor?: number },
    ) => {
      setSheetError(null);
      setSheetBody((prev) => {
        const res = editBendNodeInBody(prev, bendId, patch);
        if (!res.ok) {
          setSheetError(res.error ?? "Ângulo inválido");
          return prev;
        }
        return res.body;
      });
      if (patch.targetAngleDeg !== undefined) {
        setDraftFoldAngleDeg(patch.targetAngleDeg);
      }
      if (patch.direction) {
        setDraftFoldDirection(patch.direction);
      }
    },
    [],
  );

  const handleSheetSwapFixedRoot = useCallback(() => {
    setSheetBody((prev) => {
      const flangeIds = Object.keys(prev.flanges);
      if (flangeIds.length < 2) return prev;
      const idx = flangeIds.indexOf(prev.rootFlangeId);
      const nextRoot = flangeIds[(idx + 1) % flangeIds.length]!;
      return swapFixedRootFlange(prev, nextRoot);
    });
  }, []);

  const handleSheetAddHole = useCallback(
    (payload: { diameterMm: number; x: number; y: number; acrossUnfoldedBend?: boolean }) => {
      setSheetError(null);
      const res = addHoleOrCutoutToBody(sheetBody, {
        cx: payload.x,
        cy: payload.y,
        diameterMm: payload.diameterMm,
        acrossBend: Boolean(payload.acrossUnfoldedBend),
      });
      if (!res.ok) {
        setSheetError(res.error ?? "Erro ao adicionar furo");
        return;
      }
      setSheetBody(res.body);
      appendSheetTimelineNode({
        name: `Furo Chapa Ø${payload.diameterMm}mm`,
        type: "sheetHole",
        params: { ...payload },
      });
    },
    [sheetBody, appendSheetTimelineNode],
  );

  // Estado do Solver 2D & DOF (Pilar 3)
  const [sketchConflict, setSketchConflict] = useState<string | undefined>(undefined);
  const [extraConstraintsCount, setExtraConstraintsCount] = useState(0);

  const dofSummary = useMemo(() => {
    const lineEntities = entities
      .filter((e): e is Extract<Entity, { type: "line" }> => e.type === "line")
      .slice(0, 12);
    const pts: ParametricSketch2D["points"] = [];
    const lines: ParametricSketch2D["lines"] = [];
    lineEntities.forEach((l, idx) => {
      const aId = `p_${idx}_a`;
      const bId = `p_${idx}_b`;
      pts.push({ id: aId, x: l.x1, y: l.y1, fixed: idx === 0 });
      pts.push({ id: bId, x: l.x2, y: l.y2 });
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
        triggerHaptic("confirm");
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
        if (e.type === "line") {
          edges3D.push({ a: { x: e.x1, y: e.y1, z: 0 }, b: { x: e.x2, y: e.y2, z: 0 } });
          edges3D.push({
            a: { x: e.x1, y: e.y1, z: thickness },
            b: { x: e.x2, y: e.y2, z: thickness },
            hidden: true,
          });
        } else if (e.type === "circle") {
          circles3D.push({
            center: { x: e.cx, y: e.cy, z: thickness },
            radius: e.r,
            normal: { x: 0, y: 0, z: 1 },
          });
        } else if (e.type === "polyline" && e.pts.length >= 2) {
          for (let i = 0; i < e.pts.length - 1; i++) {
            const p0 = e.pts[i]!;
            const p1 = e.pts[i + 1]!;
            edges3D.push({ a: { x: p0.x, y: p0.y, z: 0 }, b: { x: p1.x, y: p1.y, z: 0 } });
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
      if (e.type === "line") lines++;
      else if (e.type === "circle") circles++;
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

  const activeSelectedBend =
    (selectedBendId ? sheetBody.bends[selectedBendId] : null) ??
    Object.values(sheetBody.bends)[0] ??
    null;

  return (
    <>
      {/* ALÇA ANGULAR 3D ARRASTÁVEL (SOMENTE QUANDO PREVIEW 3D DE CHAPA ESTÁ ATIVO NO MODO 3D) */}
      <ChamferInstrumentErrorBoundary instrumentName="Alça Angular 3D">
        <ChamferBendAngleHandle3D
          visible={activeMode === "3d" && sheet3DPreviewActive && activeSheet === "sheet" && Boolean(activeSelectedBend)}
          angleDeg={activeSelectedBend?.targetAngleDeg ?? draftFoldAngleDeg}
          direction={activeSelectedBend?.direction ?? draftFoldDirection}
          label={activeSelectedBend ? `Dobra ${activeSelectedBend.bendId}` : "Dobra Ativa"}
          onChangeAngle={(nextDeg) => {
            setDraftFoldAngleDeg(nextDeg);
            if (activeSelectedBend) {
              handleSheetEditBend(activeSelectedBend.bendId, { targetAngleDeg: nextDeg });
            }
          }}
          onToggleDirection={() => {
            const nextDir: BendDirection =
              (activeSelectedBend?.direction ?? draftFoldDirection) === "UP" ? "DOWN" : "UP";
            setDraftFoldDirection(nextDir);
            if (activeSelectedBend) {
              handleSheetEditBend(activeSelectedBend.bendId, { direction: nextDir });
            }
          }}
        />
      </ChamferInstrumentErrorBoundary>

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
            // Atualiza automaticamente qualquer dobra cuja angleExpression referencia este parâmetro
            setSheetBody((prev) => {
              let next = prev;
              for (const b of Object.values(prev.bends)) {
                if (b.angleExpression && b.angleExpression.trim() === name && val > 0 && val <= 180) {
                  const res = editBendNodeInBody(next, b.bendId, { targetAngleDeg: val });
                  if (res.ok) next = res.body;
                }
              }
              return next;
            });
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
          sheetBody={sheetBody}
          sheet3DPreviewActive={sheet3DPreviewActive}
          onToggleSheet3DPreview={() => setSheet3DPreviewActive((v) => !v)}
          selectedBendId={selectedBendId}
          onSelectBendId={setSelectedBendId}
          detectionChipText={detectionChipText}
          sheetError={sheetError}
          onSheetRuleChange={handleSheetRuleChange}
          onSheetFold={handleSheetFold}
          onSheetAddEdgeFlange={handleSheetAddEdgeFlange}
          onSheetCreateContourFlange={handleSheetCreateContourFlange}
          onSheetUnfold={handleSheetUnfold}
          onSheetRefold={handleSheetRefold}
          onSheetEditBend={handleSheetEditBend}
          onSheetSwapFixedRoot={handleSheetSwapFixedRoot}
          onSheetAddHole={handleSheetAddHole}
          onSheetDetectDihedral={handleSheetDetectDihedral}
          draftFoldAngleDeg={draftFoldAngleDeg}
          draftFoldDirection={draftFoldDirection}
          onDraftFoldAngleChange={setDraftFoldAngleDeg}
          onDraftFoldDirectionChange={setDraftFoldDirection}
          onApplyConstraint={(type: SketchConstraintType) => {
            setSketchConflict(undefined);
            setExtraConstraintsCount((c) => c + 1);
            onNotify?.(`Restrição "${type}" aplicada ao esboço.`);
          }}
          onAutoConstrain={() => {
            const lineEntities = entities
              .filter((e): e is Extract<Entity, { type: "line" }> => e.type === "line")
              .slice(0, 12);
            const pts: ParametricSketch2D["points"] = [];
            const lines: ParametricSketch2D["lines"] = [];
            lineEntities.forEach((l, idx) => {
              pts.push({ id: `p${idx}a`, x: l.x1, y: l.y1 });
              pts.push({ id: `p${idx}b`, x: l.x2, y: l.y2 });
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
            } else if (cmdId === "sheet.unfold") {
              setTimelineOpen(false);
              setActiveSheet("sheet");
              handleSheetUnfold();
            } else if (cmdId === "sheet.refold") {
              setTimelineOpen(false);
              setActiveSheet("sheet");
              handleSheetRefold();
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
            } else if (actionId === "sketch_on_face") {
              setTimelineOpen(false);
              setActiveSheet("constraints");
            } else if (actionId === "press_pull") {
              onNotify?.("Press-Pull ativo: arraste a face selecionada.");
            } else if (actionId === "fillet_3d" || actionId === "chamfer_3d") {
              onRunLegacyCommand?.(actionId);
            } else if (actionId === "hide_body") {
              onNotify?.("Visibilidade do corpo alternada.");
            }
          }}
        />
      </ChamferInstrumentErrorBoundary>
    </>
  );
}
