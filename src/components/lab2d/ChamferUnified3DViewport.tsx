/**
 * CALDRA CHAMFER — VIEWPORT 3D SÓLIDO UNIFICADO (IN-PLACE NO MESMO CANVAS 2D/3D)
 *
 * Renderiza o sólido B-Rep 3D (SÓLIDO / SOMB) com todas as operações de Modelagem Direta 3D:
 * - Extrude (altura individual por peça + elevação Z + booleanas)
 * - Fillet / Chamfer 3D em arestas (ex.: R10 mm nas 4 quinas de uma coluna)
 * - Shell / Casca oca (ex.: Tubo estrutural Metalon com parede de 6 mm)
 * - Offset Face (esticar comprimento ou expandir faces laterais)
 * - Rotate Around Axis / Corte em Meia-Esquadria 45°
 * - Destaque em Ciano Técnico (#00B4D8 / #38BDF8) nas Faces, Arestas e Corpos selecionados.
 *
 * Sincronizado 1:1 com o estado de câmera 2D/3D (`view: { tx, ty, k }`,
 * `azimuthDeg`, `elevationDeg` e `pivot2D`).
 */

import React, { useEffect, useMemo, useRef } from "react";
import type { Entity, Vec2 } from "@/lib/lab2d/core";
import type { EdgeMode } from "@/lib/viz3d/cameraPresets";
import { ThreeBRepRenderer } from "@/lib/cad/renderer/ThreeBRepRenderer";
import {
  buildDirectTopology3DScene,
  type DirectTopology3DScene,
  type SubElementSelectionState3D,
} from "@/lib/lab2d/cadDirectModeling3D";

export interface ChamferUnified3DViewportProps {
  active?: boolean;
  entities: Entity[];
  thickness?: number;
  sheetThicknessMm?: number;
  edgeMode?: EdgeMode;
  renderStyle3D?: EdgeMode;
  view2D?: { tx: number; ty: number; k: number };
  view?: { tx: number; ty: number; k: number };
  viewportSize?: { w: number; h: number };
  width?: number;
  height?: number;
  azimuthDeg: number;
  elevationDeg: number;
  pivot2D: Vec2;
  isDark: boolean;
  isAmoled?: boolean;
  initialTreeJson?: string;
  onTreeChange?: (json: string | undefined) => void;
  activeLoftPreviewMesh?: unknown;
  topologyScene?: DirectTopology3DScene;
  subSelection3D?: SubElementSelectionState3D;
}

export const ChamferUnified3DViewport: React.FC<ChamferUnified3DViewportProps> = ({
  active = true,
  entities,
  thickness,
  sheetThicknessMm,
  edgeMode,
  renderStyle3D: renderStyle3DProp,
  view2D,
  view: viewProp,
  viewportSize,
  width: widthProp,
  height: heightProp,
  azimuthDeg,
  elevationDeg,
  pivot2D,
  isDark,
  topologyScene,
  subSelection3D,
}) => {
  const effectiveThickness = sheetThicknessMm ?? thickness ?? 20;
  const view = viewProp ?? view2D ?? { tx: 0, ty: 0, k: 1 };
  const width = widthProp ?? viewportSize?.w ?? 800;
  const height = heightProp ?? viewportSize?.h ?? 600;
  const renderStyle3D = renderStyle3DProp ?? edgeMode ?? "shaded-edges";

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);

  const computedScene = useMemo(
    () => topologyScene ?? buildDirectTopology3DScene(entities, effectiveThickness),
    [topologyScene, entities, effectiveThickness],
  );

  // 1. Inicializa o ThreeBRepRenderer uma única vez com controles internos desativados
  //    (toda navegação Pan/Zoom/Órbita vem diretamente do canvas unificado de Lab2DEditor)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new ThreeBRepRenderer({
      container,
      edgeMode: renderStyle3D,
      transparentBackground: true,
      showFloorGrid: false,
      disableOrbitControls: true,
      onDemandRender: true,
    });
    renderer.setCameraProjection(true);
    renderer.setTheme(isDark ? "dark" : "light");
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Sincroniza o Tema (Dark / Light) e Pausa quando oculto
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPaused(!active);
    renderer.setTheme(isDark ? "dark" : "light");
  }, [isDark, active]);

  // 3. Reconstrói e carrega a malha B-Rep 3D sempre que a topologia 3D mudar
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (computedScene.bodies.length > 0) {
      renderer.setShape(computedScene.tessellatedShape, false);
    } else {
      renderer.setShape(null, false);
    }
  }, [computedScene]);

  // 4. Sincroniza o destaque Ciano Técnico (#00B4D8) das Faces e Arestas selecionadas no ThreeBRepRenderer
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!subSelection3D) {
      renderer.clearSelection();
      return;
    }

    renderer.clearSelection();
    let count = 0;

    for (const fId of subSelection3D.faceIds) {
      if (count >= 2) break;
      const f = computedScene.facesById.get(fId);
      if (f) {
        renderer.selectEntity(
          {
            id: f.faceId,
            type: "face",
            index: f.meshFaceIndex,
            point: { x: f.centroid.x, y: -f.centroid.y, z: f.centroid.z },
            normal: { x: f.normal.x, y: -f.normal.y, z: f.normal.z },
          },
          count > 0,
        );
        count++;
      }
    }

    for (const eId of subSelection3D.edgeIds) {
      if (count >= 2) break;
      const e = computedScene.edgesById.get(eId);
      if (e) {
        renderer.selectEntity(
          {
            id: e.edgeId,
            type: "edge",
            index: e.meshEdgeIndex,
            point: { x: e.midpoint.x, y: -e.midpoint.y, z: e.midpoint.z },
          },
          count > 0,
        );
        count++;
      }
    }

    renderer.requestRender();
  }, [computedScene, subSelection3D]);

  // 5. Sincroniza o estilo visual 3D (SÓLIDO = shaded-edges, SOMB = shaded, ARAME = wireframe)
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setEdgeMode(renderStyle3D);
  }, [renderStyle3D]);

  // 6. Sincroniza 1:1 a projeção ortográfica 3D com `view (tx, ty, k)` e `azimuthDeg / elevationDeg`
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !active || width <= 0 || height <= 0) return;

    const avgMidZ =
      computedScene.bodies.length > 0
        ? computedScene.bodies.reduce(
            (acc, b) => acc + (b.bbox3D.minZ + b.bbox3D.maxZ) * 0.5,
            0,
          ) / computedScene.bodies.length
        : Math.max(0.5, effectiveThickness) * 0.5;

    const pivotX = Number.isFinite(pivot2D.x) ? pivot2D.x : 0;
    const pivotY = Number.isFinite(pivot2D.y) ? pivot2D.y : 0;

    renderer.syncWith2DViewport({
      view2D: view,
      viewportWidth: width,
      viewportHeight: height,
      azimuthDeg,
      elevationDeg,
      pivot2D: { x: pivotX, y: pivotY, z: avgMidZ },
    });
    renderer.renderImmediate();
  }, [
    active,
    view.tx,
    view.ty,
    view.k,
    width,
    height,
    azimuthDeg,
    elevationDeg,
    pivot2D.x,
    pivot2D.y,
    effectiveThickness,
    computedScene,
    renderStyle3D,
  ]);

  return (
    <div
      ref={containerRef}
      data-testid="chamfer-unified-3d-solid-viewport"
      style={{ display: active ? "block" : "none" }}
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden select-none"
    />
  );
};
