/**
 * CALDRA CHAMFER CAD — GIZMO 3D INTERATIVO (EIXOS +X, +Y, +Z / ORTHO < +Z)
 * E PAINEL CONTEXTUAL FLUTUANTE DA FERRAMENTA "LOFT 3D" (ESTILO AUTOCAD / SHAPR3D)
 *
 * Opera em paridade total nos layouts Paisagem (Horizontal) e Vertical (Retrato — estilo Lightroom),
 * tanto em `ISO 2D` / `ÓRBITA 3D` quanto em `CAD 3D`.
 */

import React, { useCallback, useRef, useState } from "react";
import type { Entity, Vec2 } from "@/lib/lab2d/core";
import type { IsoPlane } from "@/lib/lab2d/isometricEngine";
import type { WorkplaneOrbitProjection2D } from "@/lib/lab2d/orbit3dController";
import {
  classifyProfileKindLabel,
  computeEntityTrueCentroid2D,
  computeSelectionCentroid3D,
  getEntityElevationZ,
  getScreenPixelsPerMmZ,
  isLoft3DEntity,
  projectPoint3DToCanvasViewMm,
  type LoftBodyMode,
  type LoftSurfaceMode,
} from "@/lib/lab2d/cadLoft3DEngine";
import {
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  X,
} from "lucide-react";

export interface Chamfer3DGizmoAndLoftOverlayProps {
  entities: Entity[];
  selectedIds?: Set<string>;
  selection?: string[];
  view: { tx: number; ty: number; k: number };
  isIsometric: boolean;
  isoPlane: IsoPlane;
  orbitProjection: WorkplaneOrbitProjection2D;
  is3DViewActive?: boolean;
  isPortrait?: boolean;
  /** Atualização em tempo real durante arraste do Gizmo (sem gravar histórico a cada frame) */
  onLiveElevateSelection: (newElevationZ: number, deltaZ: number) => void;
  /** Commit final no histórico Undo/Redo ao soltar o arraste do Gizmo */
  onCommitElevateSelection: (newElevationZ: number) => void;
  /** Translação ortogonal X ou Y pelo Gizmo 3D */
  onLiveTranslateSelectionXY: (dx: number, dy: number) => void;
  onCommitTranslateSelectionXY: (dx: number, dy: number) => void;
  /** Abre o teclado numérico CAD para digitar a elevação Z exata em mm */
  onOpenElevationKeypad: (currentZ: number) => void;
  /** Estado da ferramenta LOFT 3D */
  isLoftToolActive: boolean;
  loftSectionIds: string[];
  loftSurfaceMode: LoftSurfaceMode;
  loftBodyMode: LoftBodyMode;
  sheetThicknessMm: number;
  onChangeLoftSurfaceMode: (mode: LoftSurfaceMode) => void;
  onChangeLoftBodyMode: (mode: LoftBodyMode) => void;
  onUpdateSectionElevationZ: (entityId: string, newElevationZ: number) => void;
  onAutoSpaceLoftSectionsZ: (stepMm?: number) => void;
  onRemoveLoftSection: (entityId: string) => void;
  onConfirmLoft3D: () => void;
  onCancelLoft3D: () => void;
  onActivateLoftToolFromSelection?: () => void;
}

type ActiveGizmoAxis = "x" | "y" | "z" | null;

export const Chamfer3DGizmoAndLoftOverlay: React.FC<Chamfer3DGizmoAndLoftOverlayProps> = ({
  entities = [],
  selectedIds,
  selection,
  view,
  isIsometric,
  isoPlane,
  orbitProjection,
  is3DViewActive = false,
  isPortrait = false,
  onLiveElevateSelection,
  onCommitElevateSelection,
  onLiveTranslateSelectionXY,
  onCommitTranslateSelectionXY,
  onOpenElevationKeypad,
  isLoftToolActive,
  loftSectionIds = [],
  loftSurfaceMode,
  loftBodyMode,
  sheetThicknessMm,
  onChangeLoftSurfaceMode,
  onChangeLoftBodyMode,
  onUpdateSectionElevationZ,
  onAutoSpaceLoftSectionsZ,
  onRemoveLoftSection,
  onConfirmLoft3D,
  onCancelLoft3D,
  onActivateLoftToolFromSelection,
}) => {
  const [hoveredAxis, setHoveredAxis] = useState<ActiveGizmoAxis>(null);
  const [draggingAxis, setDraggingAxis] = useState<ActiveGizmoAxis>(null);
  const [liveDragZ, setLiveDragZ] = useState<number | null>(null);
  const [dragStartZ, setDragStartZ] = useState<number>(0);
  const [dragCursorScreen, setDragCursorScreen] = useState<Vec2 | null>(null);
  const [loftMenuExpanded, setLoftMenuExpanded] = useState<boolean>(true);

  const dragRef = useRef<{
    axis: "x" | "y" | "z";
    startClientX: number;
    startClientY: number;
    initialZ: number;
    currentZ: number;
    accumDx: number;
    accumDy: number;
  } | null>(null);

  const safeSelectedIds =
    selectedIds instanceof Set
      ? selectedIds
      : Array.isArray(selection)
        ? new Set(selection)
        : new Set<string>();
  const selectedEntities = (Array.isArray(entities) ? entities : []).filter(
    (e) => Boolean(e && e.id) && safeSelectedIds.has(e.id) && e.type !== "text",
  );

  // Calcula a posição 2D na tela de qualquer ponto 3D (x, y, z)
  const project3DToScreen = useCallback(
    (pt: { x: number; y: number; z: number }): Vec2 => {
      const mmPt = projectPoint3DToCanvasViewMm(pt, isIsometric, isoPlane, orbitProjection);
      return {
        x: view.tx + view.k * mmPt.x,
        y: view.ty + view.k * mmPt.y,
      };
    },
    [isIsometric, isoPlane, orbitProjection, view.k, view.tx, view.ty],
  );

  // Centro 3D da seleção atual
  const selectionCentroid3D =
    selectedEntities.length > 0 ? computeSelectionCentroid3D(selectedEntities) : null;

  const currentElevationZ =
    liveDragZ !== null
      ? liveDragZ
      : selectionCentroid3D
        ? selectionCentroid3D.z
        : 0;

  const gizmoOriginScreen = selectionCentroid3D
    ? project3DToScreen({
        x: selectionCentroid3D.x,
        y: selectionCentroid3D.y,
        z: currentElevationZ,
      })
    : null;

  const gizmoBaseZ0Screen = selectionCentroid3D
    ? project3DToScreen({
        x: selectionCentroid3D.x,
        y: selectionCentroid3D.y,
        z: dragRef.current ? dragStartZ : 0,
      })
    : null;

  // Calcula vetores unitários de tela para os 3 eixos (+X, +Y, +Z) a partir do centroide
  const computeAxisScreenTip = useCallback(
    (axis: "x" | "y" | "z", lengthPx = 68): Vec2 => {
      if (!selectionCentroid3D || !gizmoOriginScreen) return { x: 0, y: 0 };
      const basePt = {
        x: selectionCentroid3D.x,
        y: selectionCentroid3D.y,
        z: currentElevationZ,
      };
      const deltaPt =
        axis === "x"
          ? { x: basePt.x + 10, y: basePt.y, z: basePt.z }
          : axis === "y"
            ? { x: basePt.x, y: basePt.y + 10, z: basePt.z }
            : { x: basePt.x, y: basePt.y, z: basePt.z + 10 };

      const p0 = project3DToScreen(basePt);
      const p1 = project3DToScreen(deltaPt);
      let dx = p1.x - p0.x;
      let dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);

      if (axis === "z" && len < 1e-2) {
        // Mesmo que a vista esteja 2D plana, a seta +Z aponta verticalmente para cima (-Y)
        dx = 0;
        dy = -1;
      } else if (len > 1e-3) {
        dx /= len;
        dy /= len;
      } else {
        dx = axis === "x" ? 1 : 0;
        dy = axis === "y" ? 1 : -1;
      }

      return {
        x: gizmoOriginScreen.x + dx * lengthPx,
        y: gizmoOriginScreen.y + dy * lengthPx,
      };
    },
    [currentElevationZ, gizmoOriginScreen, project3DToScreen, selectionCentroid3D],
  );

  // Início do arraste nos eixos do Gizmo 3D
  const handleAxisPointerDown = (
    axis: "x" | "y" | "z",
    ev: React.PointerEvent<SVGElement | HTMLButtonElement>,
  ) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (!selectionCentroid3D) return;

    const initZ = Number(selectionCentroid3D.z.toFixed(2));
    setDraggingAxis(axis);
    setDragStartZ(initZ);
    setLiveDragZ(initZ);
    setDragCursorScreen({ x: ev.clientX, y: ev.clientY });

    dragRef.current = {
      axis,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      initialZ: initZ,
      currentZ: initZ,
      accumDx: 0,
      accumDy: 0,
    };

    const onMove = (moveEv: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      setDragCursorScreen({ x: moveEv.clientX, y: moveEv.clientY });

      if (st.axis === "z") {
        // Movimento vertical para cima (-Y na tela) aumenta +Z em milímetros
        const dyScreen = st.startClientY - moveEv.clientY;
        const pxPerMmZ = getScreenPixelsPerMmZ(
          view.k,
          isIsometric,
          isoPlane,
          orbitProjection,
        );
        const rawDeltaZ = dyScreen / Math.max(0.35, pxPerMmZ);
        // Snap suave a cada 1.0 mm (ou 0.5 mm se zoom alto)
        const snapStep = view.k > 2.2 ? 0.5 : 1.0;
        const snappedZ = Math.round((st.initialZ + rawDeltaZ) / snapStep) * snapStep;
        const deltaFromPrev = snappedZ - st.currentZ;
        st.currentZ = snappedZ;
        setLiveDragZ(snappedZ);
        if (Math.abs(deltaFromPrev) > 1e-4) {
          onLiveElevateSelection(snappedZ, deltaFromPrev);
        }
      } else {
        const dxScreen = moveEv.clientX - st.startClientX;
        const dyScreen = moveEv.clientY - st.startClientY;
        const safeK = Math.max(0.05, view.k);
        const targetDx = st.axis === "x" ? Math.round(dxScreen / safeK) : 0;
        const targetDy = st.axis === "y" ? Math.round(dyScreen / safeK) : 0;
        const stepDx = targetDx - st.accumDx;
        const stepDy = targetDy - st.accumDy;
        if (Math.abs(stepDx) > 0.01 || Math.abs(stepDy) > 0.01) {
          st.accumDx = targetDx;
          st.accumDy = targetDy;
          onLiveTranslateSelectionXY(stepDx, stepDy);
        }
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const st = dragRef.current;
      dragRef.current = null;
      setDraggingAxis(null);
      setLiveDragZ(null);
      setDragCursorScreen(null);

      if (!st) return;
      if (st.axis === "z") {
        onCommitElevateSelection(st.currentZ);
      } else if (Math.abs(st.accumDx) > 0.01 || Math.abs(st.accumDy) > 0.01) {
        onCommitTranslateSelectionXY(st.accumDx, st.accumDy);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Seções selecionadas para o LOFT 3D
  const pickedLoftSections = loftSectionIds
    .map((id, idx) => {
      const ent = entities.find((e) => e.id === id);
      if (!ent) return null;
      const c2 = computeEntityTrueCentroid2D(ent);
      const z = getEntityElevationZ(ent);
      const screenPos = project3DToScreen({ x: c2.x, y: c2.y, z });
      return {
        order: idx + 1,
        entity: ent,
        kindLabel: classifyProfileKindLabel(ent),
        elevationZ: z,
        screenPos,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Verifica se todas as seções selecionadas no Loft estão na mesma altura Z (para sugerir Auto-Espaçar)
  const allLoftSectionsSameZ =
    pickedLoftSections.length >= 2 &&
    pickedLoftSections.every(
      (s) => Math.abs(s.elevationZ - pickedLoftSections[0]!.elevationZ) < 0.05,
    );

  const showGizmo =
    !isLoftToolActive &&
    selectedEntities.length > 0 &&
    gizmoOriginScreen !== null &&
    (is3DViewActive || Math.abs(currentElevationZ) > 0.01 || draggingAxis !== null);

  const xTip = showGizmo ? computeAxisScreenTip("x", 64) : { x: 0, y: 0 };
  const yTip = showGizmo ? computeAxisScreenTip("y", 64) : { x: 0, y: 0 };
  const zTip = showGizmo ? computeAxisScreenTip("z", 78) : { x: 0, y: 0 };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none">
      {/* CAMADA SVG: GIZMO 3D DE TRANSLAÇÃO (+X, +Y, +Z) E MARCADORES DE SEÇÃO LOFT [1], [2], [3] */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <filter id="chamfer-gizmo-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.65" />
          </filter>
        </defs>

        {/* 1. LINHA DE RASTREAMENTO ORTOGONAL VERTICAL (+Z) DURANTE ARRASTE OU ELEVAÇÃO */}
        {showGizmo && gizmoOriginScreen && gizmoBaseZ0Screen && (
          <g filter="url(#chamfer-gizmo-glow)">
            {(draggingAxis === "z" || Math.abs(currentElevationZ) > 0.05) && (
              <>
                <line
                  x1={gizmoBaseZ0Screen.x}
                  y1={gizmoBaseZ0Screen.y}
                  x2={gizmoOriginScreen.x}
                  y2={gizmoOriginScreen.y}
                  stroke={draggingAxis === "z" ? "#F59E0B" : "#38BDF8"}
                  strokeWidth={draggingAxis === "z" ? 2.4 : 1.6}
                  strokeDasharray="5 4"
                />
                <circle
                  cx={gizmoBaseZ0Screen.x}
                  cy={gizmoBaseZ0Screen.y}
                  r={4}
                  fill="#0F172A"
                  stroke={draggingAxis === "z" ? "#F59E0B" : "#38BDF8"}
                  strokeWidth={2}
                />
              </>
            )}

            {/* EIXO +X (Vermelho #EF4444) */}
            <g
              className="pointer-events-auto cursor-ew-resize"
              onPointerEnter={() => setHoveredAxis("x")}
              onPointerLeave={() => setHoveredAxis(null)}
              onPointerDown={(ev) => handleAxisPointerDown("x", ev)}
            >
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={xTip.x}
                y2={xTip.y}
                stroke="transparent"
                strokeWidth={18}
              />
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={xTip.x}
                y2={xTip.y}
                stroke={hoveredAxis === "x" || draggingAxis === "x" ? "#F59E0B" : "#EF4444"}
                strokeWidth={hoveredAxis === "x" || draggingAxis === "x" ? 3.6 : 2.6}
                strokeLinecap="round"
              />
              <circle
                cx={xTip.x}
                cy={xTip.y}
                r={5.5}
                fill={hoveredAxis === "x" || draggingAxis === "x" ? "#F59E0B" : "#EF4444"}
              />
              <text
                x={xTip.x + 10}
                y={xTip.y + 4}
                fill="#FCA5A5"
                fontSize="10"
                fontWeight="800"
                fontFamily="ui-monospace, monospace"
              >
                +X
              </text>
            </g>

            {/* EIXO +Y (Verde #10B981) */}
            <g
              className="pointer-events-auto cursor-ns-resize"
              onPointerEnter={() => setHoveredAxis("y")}
              onPointerLeave={() => setHoveredAxis(null)}
              onPointerDown={(ev) => handleAxisPointerDown("y", ev)}
            >
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={yTip.x}
                y2={yTip.y}
                stroke="transparent"
                strokeWidth={18}
              />
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={yTip.x}
                y2={yTip.y}
                stroke={hoveredAxis === "y" || draggingAxis === "y" ? "#F59E0B" : "#10B981"}
                strokeWidth={hoveredAxis === "y" || draggingAxis === "y" ? 3.6 : 2.6}
                strokeLinecap="round"
              />
              <circle
                cx={yTip.x}
                cy={yTip.y}
                r={5.5}
                fill={hoveredAxis === "y" || draggingAxis === "y" ? "#F59E0B" : "#10B981"}
              />
              <text
                x={yTip.x + 10}
                y={yTip.y + 4}
                fill="#6EE7B7"
                fontSize="10"
                fontWeight="800"
                fontFamily="ui-monospace, monospace"
              >
                +Y
              </text>
            </g>

            {/* EIXO +Z VERTICAL (Azul Brilhante #3B82F6 -> Âmbar #F59E0B ao interagir) */}
            <g
              className="pointer-events-auto cursor-ns-resize"
              onPointerEnter={() => setHoveredAxis("z")}
              onPointerLeave={() => setHoveredAxis(null)}
              onPointerDown={(ev) => handleAxisPointerDown("z", ev)}
            >
              {/* Área de toque generosa de 26px para arraste fácil com o dedo ou mouse */}
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={zTip.x}
                y2={zTip.y}
                stroke="transparent"
                strokeWidth={26}
              />
              <line
                x1={gizmoOriginScreen.x}
                y1={gizmoOriginScreen.y}
                x2={zTip.x}
                y2={zTip.y}
                stroke={hoveredAxis === "z" || draggingAxis === "z" ? "#F59E0B" : "#3B82F6"}
                strokeWidth={hoveredAxis === "z" || draggingAxis === "z" ? 4.2 : 3.4}
                strokeLinecap="round"
              />
              {/* Ponta de seta cônica +Z */}
              <polygon
                points={`${zTip.x},${zTip.y - 9} ${zTip.x - 6.5},${zTip.y + 5} ${zTip.x + 6.5},${zTip.y + 5}`}
                fill={hoveredAxis === "z" || draggingAxis === "z" ? "#F59E0B" : "#3B82F6"}
              />
              <text
                x={zTip.x}
                y={zTip.y - 14}
                textAnchor="middle"
                fill={hoveredAxis === "z" || draggingAxis === "z" ? "#FDE68A" : "#60A5FA"}
                fontSize="11"
                fontWeight="900"
                fontFamily="ui-monospace, monospace"
              >
                +Z
              </text>
            </g>

            {/* Pivô Central 3D `(Cx, Cy, Cz)` */}
            <circle
              cx={gizmoOriginScreen.x}
              cy={gizmoOriginScreen.y}
              r={6}
              fill="#0F172A"
              stroke="#38BDF8"
              strokeWidth={2.4}
            />
          </g>
        )}

        {/* 2. CONECTORES E BADGES NUMERADOS [1], [2], [3] DA FERRAMENTA LOFT 3D */}
        {isLoftToolActive && pickedLoftSections.length > 0 && (
          <g filter="url(#chamfer-gizmo-glow)">
            {pickedLoftSections.length >= 2 &&
              pickedLoftSections.slice(0, -1).map((sec, idx) => {
                const nextSec = pickedLoftSections[idx + 1]!;
                return (
                  <line
                    key={`loft_axis_${sec.entity.id}_${nextSec.entity.id}`}
                    x1={sec.screenPos.x}
                    y1={sec.screenPos.y}
                    x2={nextSec.screenPos.x}
                    y2={nextSec.screenPos.y}
                    stroke="#38BDF8"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                );
              })}
            {pickedLoftSections.map((sec) => (
              <g
                key={`loft_badge_${sec.entity.id}`}
                transform={`translate(${sec.screenPos.x}, ${sec.screenPos.y})`}
              >
                <circle
                  r={13}
                  fill="#0284C7"
                  stroke="#E0F2FE"
                  strokeWidth={2.2}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="900"
                  fontFamily="ui-monospace, monospace"
                >
                  {sec.order}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>

      {/* BADGE FLUTUANTE DE ARRASTE ORTOGONAL: `Ortho: {elevationZ} mm < +Z` */}
      {draggingAxis === "z" && dragCursorScreen && (
        <div
          style={{
            left: Math.min(window.innerWidth - 210, dragCursorScreen.x + 18),
            top: Math.max(16, dragCursorScreen.y - 22),
          }}
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded border border-amber-400/80 bg-slate-950/95 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-300 shadow-lg"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          <span>Ortho: {currentElevationZ.toFixed(2)} mm &lt; +Z</span>
        </div>
      )}

      {/* PÍLULA INTERATIVA JUNTO AO GIZMO 3D: `[ ↕ Elevação Z: {Z} mm ]` + ATALHO `[ ⬢ Loft 3D ]` */}
      {showGizmo && gizmoOriginScreen && draggingAxis === null && (
        <div
          style={{
            left: Math.max(12, Math.min(window.innerWidth - 240, gizmoOriginScreen.x + 16)),
            top: Math.max(54, gizmoOriginScreen.y + 10),
          }}
          className="pointer-events-auto absolute z-30 flex items-center gap-1.5 rounded-md border border-sky-500/45 bg-slate-950/92 px-2 py-1 text-[11px] text-slate-100 shadow-xl backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => onOpenElevationKeypad(currentElevationZ)}
            title="Digitar altura exata de Elevação +Z (mm) no teclado numérico CAD"
            className="flex items-center gap-1 rounded bg-sky-500/20 px-2 py-0.5 font-mono font-bold text-sky-300 transition hover:bg-sky-500/35 active:scale-95"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5 text-sky-400" />
            <span>↕ Elevação Z: {currentElevationZ.toFixed(1)} mm</span>
          </button>

          {onActivateLoftToolFromSelection &&
            selectedEntities.some((e) => !isLoft3DEntity(e)) && (
              <button
                type="button"
                onClick={onActivateLoftToolFromSelection}
                title="Iniciar transição multisseção LOFT 3D a partir deste perfil"
                className="flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/20 px-2 py-0.5 font-semibold text-cyan-200 transition hover:bg-cyan-500/35 active:scale-95"
              >
                <Layers className="h-3.5 w-3.5 text-cyan-300" />
                <span>Loft 3D</span>
              </button>
            )}
        </div>
      )}

      {/* BANNER SUPERIOR E MENU CONTEXTUAL FLUTUANTE DA FERRAMENTA `LOFT 3D` (ESTILO AUTOCAD / SHAPR3D) */}
      {isLoftToolActive && (
        <>
          {/* Banner de Comando no Topo do Viewport */}
          <div
            className={`pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 ${
              isPortrait ? "top-12 w-[94%] max-w-md" : "top-3 max-w-2xl"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-400/55 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-500/25 font-mono text-[11px] font-black text-sky-300 border border-sky-400/40">
                  3D
                </span>
                <div>
                  <div className="font-bold tracking-wide text-sky-300">
                    LOFT 3D | Selecione as seções transversais na ordem da transição (mín. 2 perfis)
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {pickedLoftSections.length === 0 &&
                      "Toque no Perfil [1] (ex: Base Z=0), depois no Perfil [2] (ex: Meio Z=60) e Perfil [3] (Topo Z=120)."}
                    {pickedLoftSections.length === 1 &&
                      "1 seção selecionada [1]. Toque na 2ª seção transversal para gerar a Prévia Sólida Translúcida 3D."}
                    {pickedLoftSections.length >= 2 &&
                      `${pickedLoftSections.length} seções conectadas (${pickedLoftSections
                        .map((s) => `[${s.order}] ${s.kindLabel}`)
                        .join(" ➔ ")}). Toque em mais perfis ou confirme.`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pickedLoftSections.length < 2}
                  onClick={onConfirmLoft3D}
                  className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Criar Sólido Loft</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelLoft3D}
                  className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/90 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Cancelar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Menu Contextual Flutuante `▼ Opções de Loft 3D` (Estilo AutoCAD com seta azul `▼`) */}
          <div
            className={`pointer-events-auto absolute z-30 ${
              isPortrait
                ? "bottom-20 left-3 right-3 max-w-md mx-auto"
                : "bottom-14 left-4 w-80"
            }`}
          >
            <div className="overflow-hidden rounded-lg border border-sky-500/45 bg-slate-950/95 text-xs text-slate-100 shadow-2xl backdrop-blur-md">
              {/* Cabeçalho com seta azul estilo AutoCAD */}
              <button
                type="button"
                onClick={() => setLoftMenuExpanded((v) => !v)}
                className="flex w-full items-center justify-between border-b border-slate-800/90 bg-slate-900/90 px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow">
                    {loftMenuExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="font-bold tracking-wide text-sky-300">
                    OPÇÕES DE TRANSIÇÃO LOFT 3D
                  </span>
                </div>
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                  {pickedLoftSections.length} perfis
                </span>
              </button>

              {loftMenuExpanded && (
                <div className="space-y-2.5 p-3">
                  {/* Opção canônica AutoCAD: Somente Seções Transversais */}
                  <div className="flex items-center gap-2 rounded border border-sky-500/30 bg-sky-950/35 px-2.5 py-1.5 text-[11px] font-medium text-sky-200">
                    <span className="text-sky-400">●</span>
                    <span>Somente Seções Transversais (Cross sections only)</span>
                  </div>

                  {/* Modo da Superfície: Smooth Fit vs Ruled */}
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Modo da Superfície
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeLoftSurfaceMode("smooth")}
                        className={`rounded border px-2 py-1.5 text-[11px] font-semibold transition ${
                          loftSurfaceMode === "smooth"
                            ? "border-sky-400 bg-sky-500/25 text-sky-200 shadow-sm"
                            : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Suave / Orgânico (Smooth Fit)
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeLoftSurfaceMode("ruled")}
                        className={`rounded border px-2 py-1.5 text-[11px] font-semibold transition ${
                          loftSurfaceMode === "ruled"
                            ? "border-sky-400 bg-sky-500/25 text-sky-200 shadow-sm"
                            : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Reto / Vincado (Ruled)
                      </button>
                    </div>
                  </div>

                  {/* Modo de Corpo: Sólido Maciço vs Casca / Tubo Oco */}
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Modo de Corpo 3D
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeLoftBodyMode("solid")}
                        className={`rounded border px-2 py-1.5 text-[11px] font-semibold transition ${
                          loftBodyMode === "solid"
                            ? "border-sky-400 bg-sky-500/25 text-sky-200 shadow-sm"
                            : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Sólido 3D Maciço
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeLoftBodyMode("shell")}
                        className={`rounded border px-2 py-1.5 text-[11px] font-semibold transition ${
                          loftBodyMode === "shell"
                            ? "border-sky-400 bg-sky-500/25 text-sky-200 shadow-sm"
                            : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Casca / Tubo Oco ({sheetThicknessMm}mm)
                      </button>
                    </div>
                  </div>

                  {/* Lista interativa de Seções Transversais e suas Alturas Z (mm) */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Seções na Ordem da Transição
                      </span>
                      {allLoftSectionsSameZ && (
                        <button
                          type="button"
                          onClick={() => onAutoSpaceLoftSectionsZ(60)}
                          className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-500/30"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Auto-Espaçar +Z (60mm)</span>
                        </button>
                      )}
                    </div>

                    {pickedLoftSections.length === 0 ? (
                      <div className="rounded border border-dashed border-slate-800 bg-slate-900/50 p-2 text-center text-[11px] text-slate-400">
                        Clique nos perfis fechados no canvas (Retângulo, Hexágono, Círculo...)
                      </div>
                    ) : (
                      <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
                        {pickedLoftSections.map((sec) => (
                          <div
                            key={sec.entity.id}
                            className="flex items-center justify-between gap-1.5 rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-[11px]"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-600 font-mono text-[10px] font-bold text-white">
                                {sec.order}
                              </span>
                              <span className="truncate font-medium text-slate-200">
                                {sec.kindLabel}
                              </span>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSectionElevationZ(sec.entity.id, sec.elevationZ - 20)
                                }
                                className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                              >
                                -20
                              </button>
                              <span className="min-w-[54px] text-center font-mono text-[10px] font-bold text-sky-300">
                                Z={sec.elevationZ.toFixed(0)}mm
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSectionElevationZ(sec.entity.id, sec.elevationZ + 20)
                                }
                                className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                              >
                                +20
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveLoftSection(sec.entity.id)}
                                className="ml-0.5 text-slate-500 hover:text-rose-400"
                                title="Remover seção"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Botões Finais de Confirmação e Cancelamento */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={pickedLoftSections.length < 2}
                      onClick={onConfirmLoft3D}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded bg-emerald-600 py-1.5 text-xs font-bold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      <span>✓ Criar Sólido Loft</span>
                    </button>
                    <button
                      type="button"
                      onClick={onCancelLoft3D}
                      className="flex items-center justify-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                    >
                      <X className="h-4 w-4" />
                      <span>✕ Cancelar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
