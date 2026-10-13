/**
 * CALDRA CHAMFER — CONSTRUTOR GUIADO DE PEÇAS POR FACES E PLANOS ISOMÉTRICOS
 *
 * Implementa o fluxo de construção guiada de peças em perspectiva isométrica 2D:
 * - Peças técnicas disponíveis:
 *    1. Suporte Dobrado com Aba e Furos (Base no Plano Superior, Aba no Plano Direito)
 *    2. Flange Circular Isométrico com Furação Polar (PCD) e Espessura
 *    3. Perfil U / Canal Dobrado com Furações e Linhas de Dobra
 * - Parâmetros numéricos exatos: Largura, Comprimento, Altura, Espessura, Diâmetros
 * - Posicionamento inteligente de furos em planos distintos
 * - Geração de cotas técnicas automáticas ABNT NBR 17068:2022
 * - Camadas industriais canônicas (Corte, Dobra, Recorte, Referência, Cota)
 * - Integração total com histórico (desfazer/refazer) do CHAMFER
 */

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Check,
  Disc,
  FoldHorizontal,
  Box,
  Layers,
  Ruler,
} from "lucide-react";
import {
  type IsoPlane,
  buildBentSupportPreset,
  buildIsoFlangePreset,
  buildIsoChannelPreset,
  ISO_PLANES,
} from "@/lib/lab2d/isometricEngine";
import type { Entity } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

export type IsoPieceType = "bent_support" | "iso_flange" | "iso_channel";

interface ChamferIsoPieceBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onInsertPiece: (entities: Entity[], dims: Dimension[]) => void;
  isDark?: boolean;
}

export function ChamferIsoPieceBuilderModal({
  open,
  onClose,
  onInsertPiece,
  isDark = true,
}: ChamferIsoPieceBuilderModalProps) {
  const [pieceType, setPieceType] = useState<IsoPieceType>("bent_support");

  // Parâmetros: Suporte Dobrado
  const [baseWidth, setBaseWidth] = useState(120); // mm (30°)
  const [baseLength, setBaseLength] = useState(80); // mm (150°)
  const [flangeHeight, setFlangeHeight] = useState(60); // mm (90°)
  const [thickness, setThickness] = useState(4); // mm
  const [holeDia, setHoleDia] = useState(14); // mm
  const [includeHoles, setIncludeHoles] = useState(true);
  const [includeDims, setIncludeDims] = useState(true);

  // Parâmetros: Flange Isométrico
  const [flangePlane, setFlangePlane] = useState<IsoPlane>("top");
  const [flangeOD, setFlangeOD] = useState(200);
  const [flangeID, setFlangeID] = useState(90);
  const [flangePCD, setFlangePCD] = useState(150);
  const [flangeHolesCount, setFlangeHolesCount] = useState(6);
  const [flangeHoleDia, setFlangeHoleDia] = useState(16);
  const [flangeThickness, setFlangeThickness] = useState(12);

  // Parâmetros: Canal U
  const [channelWebWidth, setChannelWebWidth] = useState(100);
  const [channelFlangeHeight, setChannelFlangeHeight] = useState(50);
  const [channelLength, setChannelLength] = useState(180);
  const [channelThickness, setChannelThickness] = useState(4);
  const [channelHoleDia, setChannelHoleDia] = useState(14);

  if (!open) return null;

  const handleGenerate = () => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");

    let result: { entities: Entity[]; dims: Dimension[] };

    if (pieceType === "bent_support") {
      result = buildBentSupportPreset({
        baseWidth: Math.max(20, baseWidth),
        baseLength: Math.max(20, baseLength),
        flangeHeight: Math.max(10, flangeHeight),
        thickness: Math.max(0.5, thickness),
        holeDiameter: includeHoles ? Math.max(3, holeDia) : 0,
        origin: { x: 0, y: 0 },
      });
    } else if (pieceType === "iso_flange") {
      result = buildIsoFlangePreset({
        plane: flangePlane,
        outerDia: Math.max(40, flangeOD),
        innerDia: Math.max(0, flangeID),
        boltCircleDia: Math.max(20, flangePCD),
        numHoles: includeHoles ? Math.max(0, flangeHolesCount) : 0,
        holeDia: Math.max(3, flangeHoleDia),
        thickness: Math.max(0, flangeThickness),
        origin: { x: 0, y: 0 },
      });
    } else {
      result = buildIsoChannelPreset({
        webWidth: Math.max(30, channelWebWidth),
        flangeHeight: Math.max(15, channelFlangeHeight),
        length: Math.max(40, channelLength),
        thickness: Math.max(0.5, channelThickness),
        holeDia: includeHoles ? Math.max(3, channelHoleDia) : 0,
        origin: { x: 0, y: 0 },
      });
    }

    onInsertPiece(result.entities, includeDims ? result.dims : []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-lg rounded-3xl border shadow-2xl p-5 sm:p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto",
          isDark
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200 text-slate-900",
        )}
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-600/10 text-red-500 border border-red-600/20">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Construção Guiada de Peças</h2>
              <p className="text-xs text-muted-foreground">
                Gere peças técnicas por faces e planos em projeção isométrica 2D
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SELETOR DE TIPO DE PEÇA */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-950/60 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setPieceType("bent_support");
            }}
            className={cn(
              "py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1",
              pieceType === "bent_support"
                ? "bg-red-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900",
            )}
          >
            <FoldHorizontal className="w-4 h-4" />
            <span>Suporte Dobrado</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setPieceType("iso_flange");
            }}
            className={cn(
              "py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1",
              pieceType === "iso_flange"
                ? "bg-red-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900",
            )}
          >
            <Disc className="w-4 h-4" />
            <span>Flange Circular</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setPieceType("iso_channel");
            }}
            className={cn(
              "py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1",
              pieceType === "iso_channel"
                ? "bg-red-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900",
            )}
          >
            <Layers className="w-4 h-4" />
            <span>Perfil U Dobrado</span>
          </button>
        </div>

        {/* PREVIEWS DOS PLANOS ENVOLVIDOS */}
        {pieceType === "bent_support" && (
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-sky-400">PLANO SUPERIOR</span>
              <span className="text-xs font-semibold mt-0.5">Base (30° × 150°)</span>
              <span className="text-[10px] text-muted-foreground">2 furos de fixação</span>
            </div>
            <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-pink-400">PLANO DIREITO</span>
              <span className="text-xs font-semibold mt-0.5">Aba Vertical (90°)</span>
              <span className="text-[10px] text-muted-foreground">Furo de articulação</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-amber-400">LINHA DE DOBRA</span>
              <span className="text-xs font-semibold mt-0.5">Raio Técnico</span>
              <span className="text-[10px] text-muted-foreground">Camada dobra ABNT</span>
            </div>
          </div>
        )}

        {pieceType === "iso_flange" && (
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-sky-400">ISOCÍRCULO</span>
              <span className="text-xs font-semibold mt-0.5">Borda Externa</span>
              <span className="text-[10px] text-muted-foreground">Projeção elíptica exata</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-emerald-400">FURAÇÃO PCD</span>
              <span className="text-xs font-semibold mt-0.5">Polar Simétrica</span>
              <span className="text-[10px] text-muted-foreground">{flangeHolesCount} furos projetados</span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-purple-400">ESPESSURA</span>
              <span className="text-xs font-semibold mt-0.5">Rebaixo 2D</span>
              <span className="text-[10px] text-muted-foreground">Tangentes de espessura</span>
            </div>
          </div>
        )}

        {pieceType === "iso_channel" && (
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-sky-400">PLANO SUPERIOR</span>
              <span className="text-xs font-semibold mt-0.5">Alma (30° × 150°)</span>
              <span className="text-[10px] text-muted-foreground">Furos centrais</span>
            </div>
            <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-pink-400">PLANO ESQUERDO</span>
              <span className="text-xs font-semibold mt-0.5">2 Abas Verticais</span>
              <span className="text-[10px] text-muted-foreground">Eixos 150° e 90°</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center text-center">
              <span className="text-[10px] font-mono font-bold text-amber-400">2 LINHAS DOBRA</span>
              <span className="text-xs font-semibold mt-0.5">Simétricas</span>
              <span className="text-[10px] text-muted-foreground">Norma ABNT NBR 16861</span>
            </div>
          </div>
        )}

        {/* CAMPOS NUMÉRICOS EXATOS: SUPORTE DOBRADO */}
        {pieceType === "bent_support" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Largura da Base (mm)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="20"
                    max="1000"
                    step="5"
                    value={baseWidth}
                    onChange={(e) => setBaseWidth(Number(e.target.value))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono font-semibold"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Comprimento da Base (mm)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="20"
                    max="1000"
                    step="5"
                    value={baseLength}
                    onChange={(e) => setBaseLength(Number(e.target.value))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono font-semibold"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">mm</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Altura Aba (mm)
                </label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="5"
                  value={flangeHeight}
                  onChange={(e) => setFlangeHeight(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Espessura (mm)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="50"
                  step="0.5"
                  value={thickness}
                  onChange={(e) => setThickness(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Furo Ø (mm)
                </label>
                <input
                  type="number"
                  min="3"
                  max="100"
                  step="1"
                  disabled={!includeHoles}
                  value={holeDia}
                  onChange={(e) => setHoleDia(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* CAMPOS NUMÉRICOS EXATOS: FLANGE ISOMÉTRICO */}
        {pieceType === "iso_flange" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Plano Isométrico
                </label>
                <select
                  value={flangePlane}
                  onChange={(e) => setFlangePlane(e.target.value as IsoPlane)}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-xs font-bold"
                >
                  <option value="top">Superior (XY)</option>
                  <option value="left">Esquerdo (YZ)</option>
                  <option value="right">Direito (XZ)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Ø Externo (OD)
                </label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="10"
                  value={flangeOD}
                  onChange={(e) => setFlangeOD(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Ø Central (ID)
                </label>
                <input
                  type="number"
                  min="0"
                  max="800"
                  step="10"
                  value={flangeID}
                  onChange={(e) => setFlangeID(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Ø Furação (PCD)
                </label>
                <input
                  type="number"
                  min="30"
                  max="900"
                  step="5"
                  value={flangePCD}
                  onChange={(e) => setFlangePCD(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2 py-2 text-xs font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Qtd Furos
                </label>
                <input
                  type="number"
                  min="0"
                  max="32"
                  step="1"
                  disabled={!includeHoles}
                  value={flangeHolesCount}
                  onChange={(e) => setFlangeHolesCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2 py-2 text-xs font-mono font-semibold disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Furo Ø
                </label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  step="1"
                  disabled={!includeHoles}
                  value={flangeHoleDia}
                  onChange={(e) => setFlangeHoleDia(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2 py-2 text-xs font-mono font-semibold disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Espessura
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={flangeThickness}
                  onChange={(e) => setFlangeThickness(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2 py-2 text-xs font-mono font-semibold"
                />
              </div>
            </div>
          </div>
        )}

        {/* CAMPOS NUMÉRICOS EXATOS: PERFIL U */}
        {pieceType === "iso_channel" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Largura Alma W (mm)
                </label>
                <input
                  type="number"
                  min="30"
                  max="600"
                  step="5"
                  value={channelWebWidth}
                  onChange={(e) => setChannelWebWidth(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Altura Abas H (mm)
                </label>
                <input
                  type="number"
                  min="15"
                  max="400"
                  step="5"
                  value={channelFlangeHeight}
                  onChange={(e) => setChannelFlangeHeight(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Comprimento L
                </label>
                <input
                  type="number"
                  min="40"
                  max="1200"
                  step="10"
                  value={channelLength}
                  onChange={(e) => setChannelLength(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Espessura T
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  value={channelThickness}
                  onChange={(e) => setChannelThickness(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Furos Ø
                </label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  step="1"
                  disabled={!includeHoles}
                  value={channelHoleDia}
                  onChange={(e) => setChannelHoleDia(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-mono font-semibold disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* CHECKBOXES DE CONFIGURAÇÃO */}
        <div className="pt-1 flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
            <input
              type="checkbox"
              checked={includeHoles}
              onChange={(e) => setIncludeHoles(e.target.checked)}
              className="rounded border-slate-700 w-4 h-4 text-red-600 focus:ring-red-500"
            />
            <span>Incluir furações industriais nos planos correspondentes</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
            <input
              type="checkbox"
              checked={includeDims}
              onChange={(e) => setIncludeDims(e.target.checked)}
              className="rounded border-slate-700 w-4 h-4 text-red-600 focus:ring-red-500"
            />
            <span>Gerar cotas técnicas verificáveis (ABNT NBR 17068:2022)</span>
          </label>
        </div>

        {/* RODAPÉ E AÇÃO */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg flex items-center gap-2 active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Inserir no Desenho</span>
          </button>
        </div>
      </div>
    </div>
  );
}
