/**
 * CHAMFER CAD — VIEWPORT 3D UNIFICADO IN-PLACE (MOTOR CAD 3D ACOPLADO AO CANVAS 2D SKETCH)
 *
 * Acopla diretamente o motor real de modelagem sólida B-Rep (`ThreeBRepRenderer` +
 * `CadFeatureTree` + `analyze2DSketchFor3D` / `sync2DSketchToFeatureTree`) dentro do
 * container principal do `2D SKETCH`, sem criar segunda tela nem barras duplicadas:
 *
 * - Fundo 100% transparente (`transparentBackground: true`) e sem `GridHelper` finito
 *   (`showFloorGrid: false`), preservando o Grid Infinito de Tela Cheia do `2D SKETCH`.
 * - Sincronização óptica 1:1 com Pan (`tx, ty`), Zoom (`k`), Ângulos Orbitais (`θ, φ`)
 *   e Pivô Inteligente (`smartOrbitPivot`) do `2D SKETCH`.
 * - Zero-Idle Overhead (`onDemandRender: true` + `setPaused`): 0% de uso de CPU/GPU
 *   quando a câmera e a geometria estão em repouso ou quando em modo plano 2D / Arame.
 */

import React, { useEffect, useRef } from "react";
import { ThreeBRepRenderer } from "@/lib/cad/renderer/ThreeBRepRenderer";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import {
  analyze2DSketchFor3D,
  sync2DSketchToFeatureTree,
} from "@/lib/cad/sketch/sketch3dBridge";
import type { Entity } from "@/lib/lab2d/core";
import type { EdgeMode } from "@/lib/viz3d/cameraPresets";
import { cn } from "@/lib/utils";

export interface ChamferUnified3DViewportProps {
  /** Define se a camada de renderização sólida 3D está visível no canvas unificado */
  active: boolean;
  /** Entidades 2D canônicas do esboço atual */
  entities: Entity[];
  /** Espessura da chapa (mm) controlada por CHAPA na barra inferior / painel direito */
  thickness: number;
  /** Estilo de visualização 3D (shaded-edges = SÓLIDO+AR, shaded = SÓLIDO, wireframe = ARAME) */
  edgeMode: EdgeMode;
  /** Estado atual de Pan/Zoom do canvas 2D */
  view2D: { tx: number; ty: number; k: number };
  /** Dimensões em pixels do viewport do canvas */
  viewportSize: { w: number; h: number };
  /** Ângulo horizontal orbital θ (graus) */
  azimuthDeg: number;
  /** Ângulo vertical orbital φ (graus) */
  elevationDeg: number;
  /** Centro inteligente da órbita em coordenadas 2D (x, y, z) */
  pivot2D: { x: number; y: number; z: number };
  /** Tema visual atual */
  isDark: boolean;
  /** Serialização opcional da árvore paramétrica 3D */
  initialTreeJson?: string;
  onTreeChange?: (json: string) => void;
}

export const ChamferUnified3DViewport = React.memo(function ChamferUnified3DViewport({
  active,
  entities,
  thickness,
  edgeMode,
  view2D,
  viewportSize,
  azimuthDeg,
  elevationDeg,
  pivot2D,
  isDark,
  initialTreeJson,
  onTreeChange,
}: ChamferUnified3DViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);
  const treeRef = useRef<CadFeatureTree | null>(null);
  const initialTreeDeserializedRef = useRef<boolean>(false);
  const lastFingerprintRef = useRef<string>("");
  const rebuildSeqRef = useRef<number>(0);

  if (!treeRef.current) {
    treeRef.current = new CadFeatureTree();
  }

  // Inicializa o motor ThreeBRepRenderer uma única vez no container acoplado ao canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderer = new ThreeBRepRenderer({
      container: el,
      edgeMode,
      transparentBackground: true,
      showFloorGrid: false,
      disableOrbitControls: true,
      onDemandRender: true,
    });
    renderer.setTheme(isDark ? "dark" : "light");
    renderer.setPaused(!active);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controle de pausa Zero-Idle quando alterna entre 2D plano / Arame e Sólido 3D
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPaused(!active);
    if (active) {
      renderer.syncWith2DViewport({
        view2D,
        viewportWidth: viewportSize.w,
        viewportHeight: viewportSize.h,
        azimuthDeg,
        elevationDeg,
        pivot2D,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Atualiza tema visual (Dark / Light)
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setTheme(isDark ? "dark" : "light");
  }, [isDark]);

  // Atualiza modo de estilo 3D (SÓLIDO+AR, SOMB, ARAME)
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setEdgeMode(edgeMode);
  }, [edgeMode]);

  // Reavalia a geometria B-Rep 3D quando entities ou thickness mudam (cache O(1) por fingerprint)
  useEffect(() => {
    const renderer = rendererRef.current;
    const tree = treeRef.current;
    if (!renderer || !tree) return;

    if (!initialTreeDeserializedRef.current && initialTreeJson) {
      initialTreeDeserializedRef.current = true;
      try {
        tree.deserializeTree(initialTreeJson);
      } catch {
        // Ignora falha de desserialização opcional
      }
    }

    const safeThickness = Number.isFinite(thickness) && thickness > 0 ? thickness : 5;
    const analysis = analyze2DSketchFor3D(entities, safeThickness);

    if (analysis.fingerprint !== lastFingerprintRef.current) {
      lastFingerprintRef.current = analysis.fingerprint;
      const seq = ++rebuildSeqRef.current;

      const extrudedIdSet = new Set(analysis.sourceEntityIds);
      const visibleWireframes =
        analysis.status === "VALID_SOLID"
          ? analysis.wireframes.filter((wf) => wf.isConstruction || !extrudedIdSet.has(wf.id))
          : analysis.wireframes;
      renderer.setSketchWireframes(visibleWireframes, visibleWireframes.length > 0);

      const syncRes = sync2DSketchToFeatureTree(tree, analysis);
      if ((analysis.status === "VALID_SOLID" && syncRes.hasSolidFeatures) || syncRes.hasSolidFeatures) {
        void tree.rebuild().then((res) => {
          if (seq !== rebuildSeqRef.current) return;
          if (!rendererRef.current) return;
          rendererRef.current.setShape(res.tessellation ?? null, false);
          if (onTreeChange) {
            try {
              onTreeChange(tree.serializeTree());
            } catch {
              // Ignora falha opcional de serialização
            }
          }
          if (active) {
            rendererRef.current.syncWith2DViewport({
              view2D,
              viewportWidth: viewportSize.w,
              viewportHeight: viewportSize.h,
              azimuthDeg,
              elevationDeg,
              pivot2D,
            });
          }
        });
      } else {
        renderer.setShape(null, false);
      }
    }
  }, [
    entities,
    thickness,
    active,
    view2D,
    viewportSize.w,
    viewportSize.h,
    azimuthDeg,
    elevationDeg,
    pivot2D,
    initialTreeJson,
    onTreeChange,
  ]);

  // Sincroniza câmera em tempo real durante Órbita 3D, Pan e Zoom
  useEffect(() => {
    if (!active) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.syncWith2DViewport({
      view2D,
      viewportWidth: viewportSize.w,
      viewportHeight: viewportSize.h,
      azimuthDeg,
      elevationDeg,
      pivot2D,
    });
  }, [
    active,
    view2D,
    viewportSize.w,
    viewportSize.h,
    azimuthDeg,
    elevationDeg,
    pivot2D,
  ]);

  return (
    <div
      ref={containerRef}
      data-testid="chamfer-unified-3d-viewport"
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 size-full transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0 invisible",
      )}
    />
  );
});
