/**
 * CALDRA CHAMFER — RENDERIZADOR SVG ESTILO MODELOS DE TRAÇAGEM
 *
 * Renderiza qualquer peça ou planificação do CHAMFER com a EXATA aparência visual
 * dos modelos de Traçagem do CALDRA (DevelopmentView / TracagemPanel):
 *  - Contornos de corte em `var(--accent)` com preenchimento sutil `fillOpacity={0.06}`;
 *  - Furos e recortes perfeitamente vazados (even-odd fill-rule);
 *  - Linhas de dobra em `var(--accent2)` tracejadas com etiqueta técnica `DOBRA {angle}°`;
 *  - Pontos notáveis em `var(--warn)` (âmbar de traçagem) com numeração e nós;
 *  - Projeção 3D Isométrica vetorial pura em SVG (com espessura real e faces laterais sombreadas);
 *  - Conversão e download de qualquer peça em SVG vetorial autônomo.
 */

import React, { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import { solidShapes, type SolidShape } from "@/lib/lab2d/solid3d";
import {
  detectAllSheetMetalParts,
  type SheetMetalProfileResult,
} from "@/lib/cad/sheetmetal/chamferSheetMetal3D";
import { toIso } from "@/lib/cad/sheetmetal/tracagemSvgExport";

export interface TracagemSvgRendererProps {
  entities: Entity[];
  zoom: number;
  thickness: number;
  viewMode3D?: "planificada" | "isometrica";
  showPoints?: boolean;
  showFolds?: boolean;
  showDims?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function TracagemSvgRenderer({
  entities,
  zoom,
  thickness = 2.0,
  viewMode3D = "planificada",
  showPoints = true,
  showFolds = true,
  showDims = true,
  selectedId,
  onSelect,
}: TracagemSvgRendererProps) {
  const k = Math.max(0.001, zoom);
  const strokeW = 1.8 / k;
  const foldStrokeW = 1.4 / k;
  const pointR = 2.8 / k;

  // Analisa as peças de chapa e contornos fechados
  const shapes = useMemo(() => solidShapes(entities), [entities]);
  const smParts = useMemo(
    () => detectAllSheetMetalParts(entities, thickness),
    [entities, thickness],
  );

  // Linhas de dobra identificadas
  const bendLines = useMemo(() => {
    return entities.filter((e) => e.layer === "dobra" && e.type === "line");
  }, [entities]);

  // Linhas de marcação / referência técnica
  const markLines = useMemo(() => {
    return entities.filter((e) => e.layer === "marcacao" && e.type === "line") as Array<
      Extract<Entity, { type: "line" }>
    >;
  }, [entities]);

  // Polilinhas abertas ou linhas soltas de corte
  const openPolylines = useMemo(() => {
    return entities.filter(
      (e) => e.layer === "corte" && e.type === "polyline" && !e.closed && e.pts.length > 1,
    ) as Array<Extract<Entity, { type: "polyline" }>>;
  }, [entities]);

  const rawCutLines = useMemo(() => {
    if (shapes.length > 0) return [];
    return entities.filter((e) => e.layer === "corte" && e.type === "line") as Array<
      Extract<Entity, { type: "line" }>
    >;
  }, [shapes, entities]);

  // Pontos notáveis em âmbar (vértices de contorno, furos e extremidades de dobra)
  const notablePoints = useMemo(() => {
    const pts: { x: number; y: number; id: string; label: string }[] = [];
    let ptCounter = 1;

    shapes.forEach((s) => {
      s.outline.forEach((p) => {
        pts.push({ x: p.x, y: p.y, id: `pt_${ptCounter}`, label: String(ptCounter++) });
      });
      s.holes.forEach((h) => {
        h.forEach((p) => {
          pts.push({ x: p.x, y: p.y, id: `pt_${ptCounter}`, label: String(ptCounter++) });
        });
      });
    });

    openPolylines.forEach((pl) => {
      pl.pts.forEach((p) => {
        pts.push({ x: p.x, y: p.y, id: `pt_${ptCounter}`, label: String(ptCounter++) });
      });
    });

    bendLines.forEach((bl) => {
      if (bl.type === "line") {
        pts.push({ x: bl.x1, y: bl.y1, id: `pt_${ptCounter}`, label: String(ptCounter++) });
        pts.push({ x: bl.x2, y: bl.y2, id: `pt_${ptCounter}`, label: String(ptCounter++) });
      }
    });

    return pts;
  }, [shapes, openPolylines, bendLines]);

  // --------------------------------------------------------------------------
  // VISTA 1: PROJEÇÃO ISOMÉTRICA 3D EM SVG ("ISOMETRIC WIREFRAME SOLID" / X-RAY)
  // --------------------------------------------------------------------------
  if (viewMode3D === "isometrica" && shapes.length > 0) {
    const t = Math.max(0.5, thickness);
    const zTop = t;
    const zBot = 0;

    return (
      <g className="tracagem-3d-iso select-none" pointerEvents="auto">
        {shapes.map((s, idx) => {
          const topPts = s.outline.map((p) => toIso(p.x, p.y, zTop));
          const botPts = s.outline.map((p) => toIso(p.x, p.y, zBot));
          const topPath =
            topPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
            " Z";
          const botPath =
            botPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
            " Z";

          // Paredes laterais da chapa sólida
          const sideWalls: string[] = [];
          for (let i = 0; i < s.outline.length; i++) {
            const next = (i + 1) % s.outline.length;
            const p0_top = topPts[i]!;
            const p1_top = topPts[next]!;
            const p1_bot = botPts[next]!;
            const p0_bot = botPts[i]!;

            sideWalls.push(
              `M ${p0_top.x.toFixed(2)} ${p0_top.y.toFixed(2)} ` +
                `L ${p1_top.x.toFixed(2)} ${p1_top.y.toFixed(2)} ` +
                `L ${p1_bot.x.toFixed(2)} ${p1_bot.y.toFixed(2)} ` +
                `L ${p0_bot.x.toFixed(2)} ${p0_bot.y.toFixed(2)} Z`,
            );
          }

          const isSel = selectedId === s.entityId;

          return (
            <g
              key={s.entityId}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(s.entityId);
              }}
              className="cursor-pointer"
            >
              {/* 1. Face Base / Arestas Ocultas (Categoria 3.4: #53647B @ 0.32, 0.8px tracejado + véu base rgba(10,18,32,0.10)) */}
              <path
                d={botPath}
                fill="rgba(10, 18, 32, 0.10)"
                stroke="rgba(83, 100, 123, 0.32)"
                strokeWidth={0.8 / k}
                strokeDasharray={`${3.6 / k} ${2.8 / k}`}
                strokeLinejoin="round"
              />

              {/* 2. Paredes Laterais de Altura/Espessura (Categoria 3.2: #91A3B8 @ 0.68, 1.1px contínuo + véu rgba(14,26,45,0.16)) */}
              {sideWalls.map((d, wIdx) => (
                <path
                  key={`wall_${idx}_${wIdx}`}
                  d={d}
                  fill="rgba(14, 26, 45, 0.16)"
                  stroke="rgba(145, 163, 184, 0.68)"
                  strokeWidth={1.1 / k}
                  strokeLinejoin="round"
                />
              ))}

              {/* 3. Face Superior Principal (Categoria 3.1: #F8FAFC @ 0.98, 1.7px contínuo + véu rgba(18,33,56,0.24) com recorte evenodd dos furos) */}
              <path
                d={
                  topPath +
                  " " +
                  s.holes
                    .map((h) => {
                      const hTop = h.map((p) => toIso(p.x, p.y, zTop));
                      return (
                        hTop
                          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                          .join(" ") + " Z"
                      );
                    })
                    .join(" ")
                }
                fillRule="evenodd"
                fill={isSel ? "rgba(56, 189, 248, 0.22)" : "rgba(18, 33, 56, 0.24)"}
                stroke="none"
              />
              <path
                d={topPath}
                fill="none"
                stroke={isSel ? "#38BDF8" : "#F8FAFC"}
                strokeOpacity={0.98}
                strokeWidth={1.7 / k}
                strokeLinejoin="round"
              />

              {/* 4. Furos Volumétricos (Anel Inferior #65758A / #53647B + Geratrizes #91A3B8 + Anel Superior #F8FAFC 1.7px) */}
              {s.holes.map((h, hIdx) => {
                const hTop = h.map((p) => toIso(p.x, p.y, zTop));
                const hBot = h.map((p) => toIso(p.x, p.y, zBot));
                const hTopPath =
                  hTop
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                    .join(" ") + " Z";
                const hBotPath =
                  hBot
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                    .join(" ") + " Z";
                const genStep = Math.max(1, Math.floor(hTop.length / 4));
                return (
                  <g key={`hole_${idx}_${hIdx}`}>
                    <path
                      d={hBotPath}
                      fill="rgba(8, 15, 28, 0.30)"
                      stroke="rgba(101, 117, 138, 0.50)"
                      strokeWidth={1.0 / k}
                      strokeLinejoin="round"
                    />
                    {hTop.map((ptTop, gIdx) => {
                      if (gIdx % genStep !== 0) return null;
                      const ptBot = hBot[gIdx];
                      if (!ptBot) return null;
                      return (
                        <line
                          key={`hgen_${idx}_${hIdx}_${gIdx}`}
                          x1={ptBot.x}
                          y1={ptBot.y}
                          x2={ptTop.x}
                          y2={ptTop.y}
                          stroke="rgba(145, 163, 184, 0.68)"
                          strokeWidth={1.05 / k}
                        />
                      );
                    })}
                    <path
                      d={hTopPath}
                      fill="none"
                      stroke="#F8FAFC"
                      strokeOpacity={0.98}
                      strokeWidth={1.7 / k}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

              {/* 5. Micro-pontos de Vértice Técnicos na Face Superior (r = 1.75px em #FFFFFF @ 0.92) */}
              {topPts.length <= 48 &&
                topPts.map((pt, pIdx) => (
                  <circle
                    key={`vdot_${idx}_${pIdx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={1.75 / k}
                    fill="rgba(255, 255, 255, 0.92)"
                  />
                ))}

              {/* 6. Linhas de dobra no topo */}
              {showFolds &&
                bendLines.map((bl) => {
                  if (bl.type !== "line") return null;
                  const p1 = toIso(bl.x1, bl.y1, zTop);
                  const p2 = toIso(bl.x2, bl.y2, zTop);
                  return (
                    <line
                      key={`iso_bend_${bl.id}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#F59E0B"
                      strokeWidth={foldStrokeW}
                      strokeDasharray={`${6 / k} ${3 / k}`}
                    />
                  );
                })}
            </g>
          );
        })}
      </g>
    );
  }

  // --------------------------------------------------------------------------
  // VISTA 2: PEÇA PLANIFICADA VETORIAL (ESTÉTICA DOS MODELOS DE TRAÇAGEM)
  // --------------------------------------------------------------------------
  return (
    <g className="tracagem-planificada select-none" pointerEvents="auto">
      {/* 1. Contornos Fechados com Preenchimento Sutil e Arestas Vivas */}
      {shapes.map((s) => {
        const isSel = selectedId === s.entityId;

        // Caminho do contorno externo
        const outerD =
          s.outline
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
            .join(" ") + " Z";

        // Caminhos de furos internos combinados com evenodd para vazamento perfeito
        const holesD = s.holes
          .map(
            (h) =>
              h.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
              " Z",
          )
          .join(" ");

        const compoundD = `${outerD} ${holesD}`.trim();

        return (
          <g
            key={s.entityId}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(s.entityId);
            }}
            className="cursor-pointer"
          >
            {/* Contorno com furos vazados via fillRule evenodd (estética Traçagem) */}
            <path
              d={compoundD}
              fillRule="evenodd"
              fill="var(--accent)"
              fillOpacity={isSel ? 0.16 : 0.06}
              stroke="var(--accent)"
              strokeWidth={strokeW}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Borda nítida dos furos */}
            {s.holes.map((h, hIdx) => {
              const holePath =
                h.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
                " Z";
              return (
                <path
                  key={`h_stroke_${s.entityId}_${hIdx}`}
                  d={holePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={strokeW * 0.9}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        );
      })}

      {/* Polilinhas abertas de corte (ex: perfis Flange Base) */}
      {openPolylines.map((pl) => (
        <polyline
          key={pl.id}
          points={pl.pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Linhas de corte soltas (se houver perfil aberto desenhado com linhas) */}
      {rawCutLines.map((e) => (
        <line
          key={e.id}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke="var(--accent)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
      ))}

      {/* 2. Linhas de Marcação / Geratrizes Técnicas */}
      {markLines.map((e) => (
        <line
          key={e.id}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke="var(--accent)"
          strokeOpacity={0.45}
          strokeWidth={foldStrokeW * 0.8}
          strokeDasharray={`${4 / k} ${3 / k}`}
        />
      ))}

      {/* 3. Linhas de Dobra em var(--accent2) com Tracejado Técnico */}
      {showFolds &&
        bendLines.map((bl) => {
          if (bl.type !== "line") return null;
          const angle = (bl as any).angleDeg ? Number((bl as any).angleDeg) : 90;
          const midX = (bl.x1 + bl.x2) / 2;
          const midY = (bl.y1 + bl.y2) / 2;

          return (
            <g key={bl.id}>
              <line
                x1={bl.x1}
                y1={bl.y1}
                x2={bl.x2}
                y2={bl.y2}
                stroke="var(--accent2)"
                strokeWidth={foldStrokeW}
                strokeDasharray={`${6 / k} ${3.5 / k}`}
              />
              {/* Etiqueta técnica da dobra com ângulo */}
              <text
                x={midX}
                y={midY - 4 / k}
                textAnchor="middle"
                fill="var(--accent2)"
                fontSize={9 / k}
                fontFamily="ui-monospace, monospace"
                className="font-semibold select-none pointer-events-none"
              >
                DOBRA {angle}°
              </text>
            </g>
          );
        })}

      {/* 4. Pontos Notáveis em Âmbar (var(--warn)), exatamente como nos Modelos de Traçagem */}
      {showPoints &&
        notablePoints.map((pt) => (
          <g key={pt.id} pointerEvents="none">
            <circle
              cx={pt.x}
              cy={pt.y}
              r={pointR}
              fill="var(--warn)"
              stroke="var(--background)"
              strokeWidth={0.8 / k}
            />
            {/* Numeração do ponto notável */}
            <text
              x={pt.x + 4 / k}
              y={pt.y - 4 / k}
              fill="var(--warn)"
              fontSize={8 / k}
              fontFamily="ui-monospace, monospace"
              className="font-medium select-none"
            >
              {pt.label}
            </text>
          </g>
        ))}

      {/* 5. Etiquetas de Identificação e Dimensões das Peças */}
      {showDims &&
        smParts.map((part) => (
          <g key={`tag_${part.id}`} pointerEvents="none">
            <text
              x={part.center.x}
              y={part.center.y - 12 / k}
              textAnchor="middle"
              fill="var(--accent)"
              fontSize={11 / k}
              fontFamily="ui-monospace, monospace"
              className="font-bold tracking-wider uppercase select-none opacity-90"
            >
              {part.code} · {part.label}
            </text>
            <text
              x={part.center.x}
              y={part.center.y + 14 / k}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={9 / k}
              fontFamily="ui-monospace, monospace"
              className="select-none opacity-80"
            >
              {part.developedLength.toFixed(1)} × {part.developedWidth.toFixed(1)} × {thickness} mm
            </text>
          </g>
        ))}
    </g>
  );
}
