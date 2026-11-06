/**
 * CALDRA CHAMFER — ABA PROPRIEDADES UNIFICADA E COMPACTA (PADRÃO SHAPR3D / FUSION / ONSHAPE)
 *
 * Hierarquia Técnica Compacta (Seção 1.3):
 *  A. Cabeçalho Compacto (1 Linha): Ícone da entidade + Nome/Tipo + Badge de Camada + Ações Rápidas.
 *  B. Dimensões (Grade de 2 Colunas — apenas campos compatíveis com a entidade):
 *     - Retângulo / Chapa / Perfil: Largura (X) e Altura (Y)
 *     - Círculo / Arco: Raio (R) e Diâmetro (Ø)
 *     - Linha: Comprimento (L) e Ângulo (∠)
 *     - Resumo técnico discreto em linha única: Perímetro · Área · Nº de vértices
 *  C. Transformação (Grade de 2 Colunas): Posição X, Posição Y, Rotação (°).
 *  D. Perfil Estrutural (BOM) & Aparência: Chapa Plana vs Metalão / Perfil BOM, Camada, Cor e Visibilidade.
 *  E. Ações Rápidas: Editar, Duplicar, Array e Excluir (vermelho reservado exclusivamente para Excluir).
 */

import React, { useState, useMemo } from "react";
import {
  Circle,
  CornerUpRight,
  Minus,
  Square,
  Type,
  Layers,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  Divide,
  Box,
  Grid,
  Eye,
  EyeOff,
  Edit3,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { type Entity, type Layer, translate, rotate } from "@/lib/lab2d/core";
import { techColor } from "@/lib/lab2d/technical";
import { ChamferCompactNumericEditor } from "@/components/lab2d/mobileEdit/ChamferCompactNumericEditor";
import type { NumericPropertyDef } from "@/components/lab2d/mobileEdit/types";
import { copyToGlobalClipboard } from "@/lib/lab2d/globalClipboard";
import { toast } from "@/lib/lab2d/chamferNotify";
import { ChamferStructuralProfileCard } from "@/components/lab2d/sidebar/ChamferStructuralProfileCard";
import {
  getEntityStructuralProfile,
  syncStructuralProfileOnGeometryChange,
} from "@/lib/lab2d/structuralProfile";
import {
  isGeometricMarkEntity,
  getGeometricMarkSpec,
  isPersistentDatumEntity,
  getPersistentDatumSpec,
  computePersistentDatumMetrics,
} from "@/lib/lab2d/cadGeometricMarks";
import {
  classifyProfileKindLabel,
  createLoft3DEntity,
  getEntityElevationZ,
  getEntityExtrudeHeight,
  getEntityLoft3DSpec,
  isLoft3DEntity,
  setEntityElevationZ,
  setEntityExtrudeHeight,
} from "@/lib/lab2d/cadLoft3DEngine";

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

interface ChamferPropertiesTabProps {
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  layers: Layer[];
  setLayers?: (layers: Layer[] | ((prev: Layer[]) => Layer[])) => void;
  thickness: number;
  onThicknessChange: (th: number) => void;
  onUpdateEntity: (e: Entity) => void;
  onDeleteEntity: (id: string) => void;
  onDuplicateEntity: (e: Entity) => void;
  onDivideEntity?: (e: Entity) => void;
  onOpenArray?: () => void;
  onDecomposeLoftEntity?: (e: Entity) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  material: string;
  onMaterialChange: (mat: string) => void;
  kFactor?: number;
  onKFactorChange?: (k: number) => void;
  bendRadius?: number;
  onBendRadiusChange?: (r: number) => void;
  isDark?: boolean;
}

export function ChamferPropertiesTab({
  entities,
  selection,
  setSelection,
  layers,
  setLayers,
  thickness,
  onThicknessChange,
  onUpdateEntity,
  onDeleteEntity,
  onDuplicateEntity,
  onDivideEntity,
  onOpenArray,
  onDecomposeLoftEntity,
  projectName,
  onProjectNameChange,
  material,
  onMaterialChange,
  kFactor = 0.4,
  onKFactorChange,
  bendRadius = 3.0,
  onBendRadiusChange,
}: ChamferPropertiesTabProps) {
  const [activeNumericProp, setActiveNumericProp] = useState<NumericPropertyDef | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    loft3d: true,
  });

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedEntity = useMemo(() => {
    if (selection.length === 1) {
      return entities.find((e) => e.id === selection[0]) ?? null;
    }
    return null;
  }, [selection, entities]);

  const selectedEntities = useMemo(() => {
    if (selection.length > 1) {
      return entities.filter((e) => selection.includes(e.id));
    }
    return [];
  }, [selection, entities]);

  const overallBounds = useMemo(() => {
    const targetList = selectedEntities.length > 0 ? selectedEntities : entities;
    if (targetList.length === 0) {
      return { minX: 0, maxX: 200, minY: 0, maxY: 100, width: 200, height: 100 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const ent of targetList) {
      if (ent.type === "circle" || ent.type === "arc") {
        minX = Math.min(minX, ent.cx - ent.r);
        maxX = Math.max(maxX, ent.cx + ent.r);
        minY = Math.min(minY, ent.cy - ent.r);
        maxY = Math.max(maxY, ent.cy + ent.r);
      } else if (ent.type === "line") {
        minX = Math.min(minX, ent.x1, ent.x2);
        maxX = Math.max(maxX, ent.x1, ent.x2);
        minY = Math.min(minY, ent.y1, ent.y2);
        maxY = Math.max(maxY, ent.y1, ent.y2);
      } else if (ent.type === "polyline" && ent.pts.length > 0) {
        for (const p of ent.pts) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      } else if (ent.type === "point") {
        minX = Math.min(minX, ent.x);
        maxX = Math.max(maxX, ent.x);
        minY = Math.min(minY, ent.y);
        maxY = Math.max(maxY, ent.y);
      }
    }

    if (minX === Infinity) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 100, height: 100 };
    }
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(0.1, maxX - minX),
      height: Math.max(0.1, maxY - minY),
    };
  }, [selectedEntities, entities]);

  const totalPerimeter = useMemo(() => {
    let len = 0;
    for (const e of entities) {
      if (e.type === "line") {
        len += Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      } else if (e.type === "circle") {
        len += 2 * Math.PI * e.r;
      } else if (e.type === "arc") {
        let sw = e.a1 - e.a0;
        while (sw < 0) sw += Math.PI * 2;
        len += e.r * sw;
      } else if (e.type === "polyline" && e.pts.length > 1) {
        for (let i = 0; i < e.pts.length - 1; i++) {
          len += Math.hypot(e.pts[i + 1].x - e.pts[i].x, e.pts[i + 1].y - e.pts[i].y);
        }
        if (e.closed && e.pts.length > 2) {
          len += Math.hypot(
            e.pts[0].x - e.pts[e.pts.length - 1].x,
            e.pts[0].y - e.pts[e.pts.length - 1].y,
          );
        }
      }
    }
    return len;
  }, [entities]);

  // Geometria e centro da entidade única selecionada
  const entityMetrics = useMemo(() => {
    if (!selectedEntity) return null;
    if (selectedEntity.type === "circle") {
      const r = selectedEntity.r;
      return {
        posX: selectedEntity.cx,
        posY: selectedEntity.cy,
        rotDeg: Number(selectedEntity.params?.rotationDeg ?? 0),
        perimeter: 2 * Math.PI * r,
        area: Math.PI * r * r,
        vertexCount: 1,
      };
    }
    if (selectedEntity.type === "arc") {
      let sw = selectedEntity.a1 - selectedEntity.a0;
      while (sw < 0) sw += Math.PI * 2;
      return {
        posX: selectedEntity.cx,
        posY: selectedEntity.cy,
        rotDeg: deg(selectedEntity.a0),
        perimeter: selectedEntity.r * sw,
        area: 0.5 * selectedEntity.r * selectedEntity.r * sw,
        vertexCount: 2,
      };
    }
    if (selectedEntity.type === "line") {
      const dx = selectedEntity.x2 - selectedEntity.x1;
      const dy = selectedEntity.y2 - selectedEntity.y1;
      const len = Math.hypot(dx, dy);
      return {
        posX: (selectedEntity.x1 + selectedEntity.x2) / 2,
        posY: (selectedEntity.y1 + selectedEntity.y2) / 2,
        rotDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
        perimeter: len,
        area: 0,
        vertexCount: 2,
      };
    }
    if (selectedEntity.type === "polyline" && selectedEntity.pts.length > 0) {
      const xs = selectedEntity.pts.map((p) => p.x);
      const ys = selectedEntity.pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      let perim = 0;
      let signedArea2 = 0;
      const n = selectedEntity.pts.length;
      for (let i = 0; i < n - 1; i++) {
        const a = selectedEntity.pts[i]!;
        const b = selectedEntity.pts[i + 1]!;
        perim += Math.hypot(b.x - a.x, b.y - a.y);
      }
      if (selectedEntity.closed && n > 2) {
        const first = selectedEntity.pts[0]!;
        const last = selectedEntity.pts[n - 1]!;
        perim += Math.hypot(first.x - last.x, first.y - last.y);
        for (let i = 0; i < n; i++) {
          const a = selectedEntity.pts[i]!;
          const b = selectedEntity.pts[(i + 1) % n]!;
          signedArea2 += a.x * b.y - b.x * a.y;
        }
      }
      return {
        posX: (minX + maxX) / 2,
        posY: (minY + maxY) / 2,
        rotDeg: Number(selectedEntity.params?.rotationDeg ?? 0),
        perimeter: perim,
        area: Math.abs(signedArea2) * 0.5,
        vertexCount: n,
        width: Math.max(0.1, maxX - minX),
        height: Math.max(0.1, maxY - minY),
        minX,
        minY,
      };
    }
    if (selectedEntity.type === "point" || selectedEntity.type === "text") {
      return {
        posX: selectedEntity.x,
        posY: selectedEntity.y,
        rotDeg: selectedEntity.type === "text" ? deg(selectedEntity.rotation ?? 0) : 0,
        perimeter: 0,
        area: 0,
        vertexCount: 1,
      };
    }
    return {
      posX: 0,
      posY: 0,
      rotDeg: 0,
      perimeter: 0,
      area: 0,
      vertexCount: 0,
    };
  }, [selectedEntity]);

  const handleNumericPropChange = (key: string, val: number) => {
    if (key === "thickness") {
      onThicknessChange(val);
      return;
    }
    if (key === "kFactor" && onKFactorChange) {
      onKFactorChange(val);
      return;
    }
    if (key === "bendRadius" && onBendRadiusChange) {
      onBendRadiusChange(val);
      return;
    }

    if (!selectedEntity || !entityMetrics) return;

    if (key === "elevationZ") {
      onUpdateEntity(setEntityElevationZ(selectedEntity, val));
      return;
    }
    if (key === "extrudeHeight") {
      onUpdateEntity(setEntityExtrudeHeight(selectedEntity, Math.max(0, val)));
      return;
    }

    // Transformação universal: Posição X, Posição Y, Rotação (°)
    if (key === "posX") {
      const dx = val - entityMetrics.posX;
      onUpdateEntity(syncStructuralProfileOnGeometryChange(translate(selectedEntity, dx, 0)));
      return;
    }
    if (key === "posY") {
      const dy = val - entityMetrics.posY;
      onUpdateEntity(syncStructuralProfileOnGeometryChange(translate(selectedEntity, 0, dy)));
      return;
    }
    if (key === "rotDeg") {
      const deltaDeg = val - entityMetrics.rotDeg;
      const rotated = rotate(
        selectedEntity,
        { x: entityMetrics.posX, y: entityMetrics.posY },
        rad(deltaDeg),
      );
      onUpdateEntity(
        syncStructuralProfileOnGeometryChange({
          ...rotated,
          params: {
            ...(rotated.params ?? {}),
            rotationDeg: val,
          },
        }),
      );
      return;
    }

    if (selectedEntity.type === "circle") {
      if (key === "diameter") {
        onUpdateEntity({ ...selectedEntity, r: Math.max(0.1, val / 2) });
      } else if (key === "radius") {
        onUpdateEntity({ ...selectedEntity, r: Math.max(0.05, val) });
      }
    } else if (selectedEntity.type === "arc") {
      if (key === "radius") {
        onUpdateEntity({ ...selectedEntity, r: Math.max(0.05, val) });
      } else if (key === "diameter") {
        onUpdateEntity({ ...selectedEntity, r: Math.max(0.05, val / 2) });
      } else if (key === "sweep") {
        onUpdateEntity({ ...selectedEntity, a1: selectedEntity.a0 + rad(val) });
      }
    } else if (selectedEntity.type === "line") {
      const dx = selectedEntity.x2 - selectedEntity.x1;
      const dy = selectedEntity.y2 - selectedEntity.y1;
      const curAng = Math.atan2(dy, dx);
      const curLen = Math.hypot(dx, dy);

      if (key === "length") {
        const nextLen = Math.max(0.1, val);
        onUpdateEntity(
          syncStructuralProfileOnGeometryChange({
            ...selectedEntity,
            x2: selectedEntity.x1 + nextLen * Math.cos(curAng),
            y2: selectedEntity.y1 + nextLen * Math.sin(curAng),
          }),
        );
      } else if (key === "angle") {
        const nextAng = rad(val);
        onUpdateEntity(
          syncStructuralProfileOnGeometryChange({
            ...selectedEntity,
            x2: selectedEntity.x1 + curLen * Math.cos(nextAng),
            y2: selectedEntity.y1 + curLen * Math.sin(nextAng),
          }),
        );
      }
    } else if (selectedEntity.type === "polyline" && selectedEntity.pts.length > 0) {
      const curW = entityMetrics.width ?? 1;
      const curH = entityMetrics.height ?? 1;
      const minX = entityMetrics.minX ?? 0;
      const minY = entityMetrics.minY ?? 0;

      if (key === "width" && curW > 0.001) {
        const scaleX = Math.max(0.1, val) / curW;
        onUpdateEntity(
          syncStructuralProfileOnGeometryChange({
            ...selectedEntity,
            pts: selectedEntity.pts.map((p) => ({
              x: minX + (p.x - minX) * scaleX,
              y: p.y,
            })),
          }),
        );
      } else if (key === "height" && curH > 0.001) {
        const scaleY = Math.max(0.1, val) / curH;
        onUpdateEntity(
          syncStructuralProfileOnGeometryChange({
            ...selectedEntity,
            pts: selectedEntity.pts.map((p) => ({
              x: p.x,
              y: minY + (p.y - minY) * scaleY,
            })),
          }),
        );
      }
    } else if (selectedEntity.type === "text") {
      if (key === "size") onUpdateEntity({ ...selectedEntity, size: Math.max(1, val) });
      if (key === "rotation") onUpdateEntity({ ...selectedEntity, rotation: rad(val) });
    }
  };

  /**
   * Célula Compacta para Grade de 2 Colunas (conectada ao ChamferCompactNumericEditor)
   */
  const renderGridCellField = (def: NumericPropertyDef, colSpan2 = false) => {
    const isEditingThis = activeNumericProp?.key === def.key;
    return (
      <div
        key={def.key}
        className={cn("relative flex flex-col gap-0.5", colSpan2 && "col-span-2")}
      >
        <span className="font-mono text-[9px] text-slate-400 truncate flex items-center gap-1">
          {def.symbol && <b className="text-sky-400">{def.symbol}</b>}
          <span>{def.label}</span>
        </span>
        <button
          type="button"
          data-testid={`prop-field-${def.key}`}
          onClick={() => {
            triggerHaptic("selection");
            setActiveNumericProp(isEditingThis ? null : def);
          }}
          className={cn(
            "flex h-7 w-full items-center justify-between rounded-md border px-2 font-mono text-[11px] font-semibold transition-all cursor-pointer",
            isEditingThis
              ? "border-sky-400 bg-sky-600/25 text-white ring-1 ring-sky-400/50"
              : "border-slate-700/90 bg-slate-950/90 text-slate-100 hover:border-sky-500/60 hover:bg-slate-900",
          )}
        >
          <span className="truncate tabular-nums">{def.value.toFixed(def.decimals ?? 1)}</span>
          {def.unit && <span className="text-[9px] text-slate-400 font-normal ml-1">{def.unit}</span>}
        </button>

        {isEditingThis && (
          <div className="absolute right-0 top-full mt-1 z-50 animate-in fade-in zoom-in-95 duration-100">
            <ChamferCompactNumericEditor
              property={def}
              onChange={(newVal) => handleNumericPropChange(def.key, newVal)}
              onConfirm={(finalVal) => {
                handleNumericPropChange(def.key, finalVal);
                setActiveNumericProp(null);
              }}
              onCancel={() => setActiveNumericProp(null)}
            />
          </div>
        )}
      </div>
    );
  };

  const activeLayerObj = selectedEntity
    ? layers.find((l) => l.id === selectedEntity.layer)
    : null;

  return (
    <div
      data-testid="chamfer-properties-tab"
      className="flex flex-col gap-2 text-slate-200 select-none pb-3"
    >
      {/* ===================================================================== */}
      {/* CASO 1: SEM SELEÇÃO → PROPRIEDADES COMPACTAS DA PEÇA & CHAPA          */}
      {/* ===================================================================== */}
      {!selectedEntity && selectedEntities.length === 0 && (
        <div className="flex flex-col gap-2">
          {/* A. Cabeçalho Compacto (1 Linha) */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-900/70 px-2 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex size-5 shrink-0 items-center justify-center rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <Box className="size-3" />
              </div>
              <span className="font-sans text-[11px] font-bold text-white truncate">
                Peça & Chapa
              </span>
            </div>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
              {entities.length} ent.
            </span>
          </div>

          {/* Identificação Compacta */}
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5">
            <div className="grid grid-cols-1 gap-1.5">
              <div>
                <label className="text-[9px] font-mono text-slate-400 block mb-0.5">
                  Nome da Peça
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="Nome da peça CAD"
                  className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 font-sans text-[11px] text-white outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono text-slate-400 block mb-0.5">
                  Material
                </label>
                <select
                  value={material}
                  onChange={(e) => onMaterialChange(e.target.value)}
                  className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-1.5 font-sans text-[11px] text-white outline-none focus:border-sky-500"
                >
                  <option value="Aço carbono (1020)">Aço Carbono (SAE 1020)</option>
                  <option value="Aço carbono (A36)">Aço Estrutural (ASTM A36)</option>
                  <option value="Aço inoxidável (304)">Aço Inox (AISI 304)</option>
                  <option value="Alumínio (5052-H32)">Alumínio Naval (5052-H32)</option>
                  <option value="Aço corten">Aço Corten / Resistente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dimensões Globais & Dobra em Grade de 2 Colunas */}
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Chapa & Conformação
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {renderGridCellField({
                key: "thickness",
                label: "Espessura",
                symbol: "e",
                value: thickness,
                unit: "mm",
                min: 0.5,
                max: 50,
                defaultStep: 0.5,
                stepOptions: [0.1, 0.5, 1, 2],
              })}
              {renderGridCellField({
                key: "bendRadius",
                label: "Raio Dobra",
                symbol: "R",
                value: bendRadius,
                unit: "mm",
                min: 0.5,
                defaultStep: 0.5,
                stepOptions: [0.5, 1, 2, 5],
              })}
              {renderGridCellField(
                {
                  key: "kFactor",
                  label: "Fator K Neutro",
                  symbol: "K",
                  value: kFactor,
                  unit: "",
                  min: 0.1,
                  max: 0.8,
                  decimals: 2,
                  defaultStep: 0.05,
                  stepOptions: [0.01, 0.05, 0.1],
                },
                true,
              )}
            </div>
            {/* Resumo técnico em linha única */}
            <div className="mt-0.5 flex items-center justify-between border-t border-slate-800/80 pt-1.5 font-mono text-[9px] text-slate-400">
              <span>
                {overallBounds.width.toFixed(0)}×{overallBounds.height.toFixed(0)} mm
              </span>
              <span>•</span>
              <span>{((overallBounds.width * overallBounds.height) / 1e6).toFixed(3)} m²</span>
              <span>•</span>
              <span>Corte {(totalPerimeter / 1000).toFixed(2)} m</span>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CASO 2: UMA ENTIDADE SELECIONADA → LAYOUT COMPACTO SHAPR3D / FUSION   */}
      {/* ===================================================================== */}
      {selectedEntity && entityMetrics && (
        <div className="flex flex-col gap-2">
          {/* A. CABEÇALHO COMPACTO (1 LINHA): Ícone + Nome/Tipo + Badge Camada + Botões Rápidos */}
          <div
            data-testid="properties-entity-header"
            className="flex items-center justify-between gap-1 rounded-lg border border-slate-800/90 bg-slate-900/80 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="flex size-5 shrink-0 items-center justify-center rounded border"
                style={{
                  background: `${techColor(selectedEntity.layer)}20`,
                  borderColor: `${techColor(selectedEntity.layer)}45`,
                  color: techColor(selectedEntity.layer),
                }}
              >
                {selectedEntity.type === "circle" && <Circle className="size-3" />}
                {selectedEntity.type === "arc" && <CornerUpRight className="size-3" />}
                {selectedEntity.type === "line" && <Minus className="size-3" />}
                {selectedEntity.type === "polyline" && <Square className="size-3" />}
                {selectedEntity.type === "text" && <Type className="size-3" />}
                {selectedEntity.type === "point" && <Crosshair className="size-3" />}
              </div>
              <span className="font-sans text-[11px] font-bold text-white truncate">
                {isGeometricMarkEntity(selectedEntity)
                  ? "Marco Geométrico"
                  : isPersistentDatumEntity(selectedEntity)
                    ? "Vetor Datum"
                    : selectedEntity.type === "circle"
                      ? "Círculo"
                      : selectedEntity.type === "arc"
                        ? "Arco"
                        : selectedEntity.type === "line"
                          ? "Linha"
                          : selectedEntity.type === "polyline"
                            ? selectedEntity.closed
                              ? "Chapa / Retângulo"
                              : "Polilinha"
                            : selectedEntity.type === "text"
                              ? "Texto"
                              : "Ponto"}
              </span>
              <span
                className="shrink-0 rounded px-1 py-0.5 font-mono text-[8.5px] font-bold uppercase"
                style={{
                  backgroundColor: `${techColor(selectedEntity.layer)}22`,
                  color: techColor(selectedEntity.layer),
                }}
              >
                {selectedEntity.layer}
              </span>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  const dup = translate(selectedEntity, 10, 10);
                  onDuplicateEntity({ ...dup, id: `ent_${Math.random().toString(36).slice(2, 9)}` });
                }}
                title="Duplicar entidade"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                <Copy className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("warning");
                  onDeleteEntity(selectedEntity.id);
                  setSelection([]);
                }}
                title="Excluir entidade"
                className="rounded p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>

          {/* B. DIMENSÕES (GRADE DE 2 COLUNAS — APENAS CAMPOS COMPATÍVEIS COM A ENTIDADE) */}
          <div
            data-testid="properties-dimensions-section"
            className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Dimensões
            </span>

            {/* Retângulo / Chapa / Polilinha -> Largura (X) e Altura (Y) */}
            {selectedEntity.type === "polyline" && (
              <div className="grid grid-cols-2 gap-1.5">
                {renderGridCellField({
                  key: "width",
                  label: "Largura (X)",
                  symbol: "W",
                  value: entityMetrics.width ?? 0,
                  unit: "mm",
                  min: 0.1,
                  defaultStep: 5,
                  stepOptions: [0.1, 1, 5, 10],
                })}
                {renderGridCellField({
                  key: "height",
                  label: "Altura (Y)",
                  symbol: "H",
                  value: entityMetrics.height ?? 0,
                  unit: "mm",
                  min: 0.1,
                  defaultStep: 5,
                  stepOptions: [0.1, 1, 5, 10],
                })}
              </div>
            )}

            {/* Círculo / Arco -> Raio (R) e Diâmetro (Ø) */}
            {(selectedEntity.type === "circle" || selectedEntity.type === "arc") && (
              <div className="grid grid-cols-2 gap-1.5">
                {renderGridCellField({
                  key: "radius",
                  label: "Raio (R)",
                  symbol: "R",
                  value: selectedEntity.r,
                  unit: "mm",
                  min: 0.05,
                  defaultStep: 1,
                  stepOptions: [0.1, 1, 5, 10],
                })}
                {renderGridCellField({
                  key: "diameter",
                  label: "Diâmetro (Ø)",
                  symbol: "Ø",
                  value: selectedEntity.r * 2,
                  unit: "mm",
                  min: 0.1,
                  defaultStep: 1,
                  stepOptions: [0.1, 1, 5, 10],
                })}
              </div>
            )}

            {/* Linha -> Comprimento (L) e Ângulo (∠) */}
            {selectedEntity.type === "line" && (
              <div className="grid grid-cols-2 gap-1.5">
                {renderGridCellField({
                  key: "length",
                  label: "Comprimento (L)",
                  symbol: "L",
                  value: entityMetrics.perimeter,
                  unit: "mm",
                  min: 0.1,
                  defaultStep: 5,
                  stepOptions: [0.1, 1, 5, 10],
                })}
                {renderGridCellField({
                  key: "angle",
                  label: "Ângulo (∠)",
                  symbol: "∠",
                  value: entityMetrics.rotDeg,
                  unit: "°",
                  defaultStep: 5,
                  stepOptions: [1, 5, 15, 45],
                  allowNegative: true,
                })}
              </div>
            )}

            {/* Texto -> Altura e Rotação */}
            {selectedEntity.type === "text" && (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={selectedEntity.text}
                  onChange={(e) => onUpdateEntity({ ...selectedEntity, text: e.target.value })}
                  className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 font-sans text-[11px] text-white outline-none focus:border-sky-500"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  {renderGridCellField({
                    key: "size",
                    label: "Altura",
                    symbol: "H",
                    value: selectedEntity.size,
                    unit: "mm",
                    min: 1,
                    defaultStep: 1,
                    stepOptions: [0.5, 1, 2, 5],
                  })}
                  {renderGridCellField({
                    key: "rotation",
                    label: "Ângulo",
                    symbol: "∠",
                    value: deg(selectedEntity.rotation ?? 0),
                    unit: "°",
                    defaultStep: 15,
                    allowNegative: true,
                  })}
                </div>
              </div>
            )}

            {/* Marco Geométrico ou Datum Persistente */}
            {selectedEntity.type === "point" && (
              <div className="font-mono text-[9.5px] text-slate-300">
                {isGeometricMarkEntity(selectedEntity) ? (
                  <div className="flex items-center justify-between rounded bg-purple-950/50 border border-purple-500/40 px-2 py-1 text-purple-200">
                    <span>{getGeometricMarkSpec(selectedEntity)?.badgeLabel ?? "Marco Associativo"}</span>
                    <span className="text-[8.5px] text-purple-300">
                      {getGeometricMarkSpec(selectedEntity)?.isOrphan ? "⚠ Órfão" : "✓ Vinculado"}
                    </span>
                  </div>
                ) : isPersistentDatumEntity(selectedEntity) ? (
                  (() => {
                    const ds = getPersistentDatumSpec(selectedEntity);
                    if (!ds) return null;
                    const dm = computePersistentDatumMetrics(ds.origin, ds.target);
                    return (
                      <div className="grid grid-cols-2 gap-1 text-[9px] text-sky-300">
                        <span>ΔX: {dm.dx.toFixed(1)} mm</span>
                        <span>ΔY: {dm.dy.toFixed(1)} mm</span>
                        <span>L: {dm.lengthL.toFixed(1)} mm</span>
                        <span>∠: {dm.angleDeg.toFixed(1)}°</span>
                      </div>
                    );
                  })()
                ) : (
                  <span>Ponto de Referência ({selectedEntity.x.toFixed(1)}, {selectedEntity.y.toFixed(1)})</span>
                )}
              </div>
            )}

            {/* Resumo Técnico Discreto em Linha Única: Perímetro, Área, Nº de Vértices */}
            <div
              data-testid="properties-technical-summary"
              className="mt-0.5 flex items-center justify-between border-t border-slate-800/80 pt-1 font-mono text-[9px] text-slate-400"
            >
              <span title="Perímetro">Perím: {entityMetrics.perimeter.toFixed(1)}mm</span>
              <span>•</span>
              <span title="Área">Área: {(entityMetrics.area / 100).toFixed(1)}cm²</span>
              <span>•</span>
              <span title="Número de vértices">Vértices: {entityMetrics.vertexCount}</span>
            </div>
          </div>

          {/* C. TRANSFORMAÇÃO (GRADE DE 2 COLUNAS: Posição X, Posição Y, Rotação °) */}
          <div
            data-testid="properties-transform-section"
            className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Transformação
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {renderGridCellField({
                key: "posX",
                label: "Posição X",
                symbol: "X",
                value: entityMetrics.posX,
                unit: "mm",
                defaultStep: 5,
                stepOptions: [0.1, 1, 5, 10],
                allowNegative: true,
              })}
              {renderGridCellField({
                key: "posY",
                label: "Posição Y",
                symbol: "Y",
                value: entityMetrics.posY,
                unit: "mm",
                defaultStep: 5,
                stepOptions: [0.1, 1, 5, 10],
                allowNegative: true,
              })}
              {renderGridCellField(
                {
                  key: "rotDeg",
                  label: "Rotação (°)",
                  symbol: "∠",
                  value: entityMetrics.rotDeg,
                  unit: "°",
                  defaultStep: 15,
                  stepOptions: [1, 5, 15, 45, 90],
                  allowNegative: true,
                },
                true,
              )}
            </div>
          </div>

          {/* D. PERFIL ESTRUTURAL (BOM) & APARÊNCIA (Chapa Plana vs Metalão / Perfil BOM, Camada, Cor, Visibilidade) */}
          <div
            data-testid="properties-bom-appearance-section"
            className="flex flex-col gap-1.5"
          >
            {(selectedEntity.type === "polyline" || selectedEntity.type === "line") && (
              <ChamferStructuralProfileCard
                entity={selectedEntity}
                onUpdateEntity={onUpdateEntity}
              />
            )}

            <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Camada & Aparência
                </span>
                <span className="font-mono text-[8.5px] text-slate-400">
                  {getEntityStructuralProfile(selectedEntity) ? "Metalão / Perfil BOM" : "Chapa Plana"}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5">
                <select
                  aria-label="Camada da entidade"
                  value={selectedEntity.layer}
                  onChange={(e) => onUpdateEntity({ ...selectedEntity, layer: e.target.value })}
                  className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-1.5 font-mono text-[10.5px] text-white outline-none focus:border-sky-500"
                >
                  {layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>

                {/* Indicador de Cor Técnica */}
                <div
                  title={`Cor da camada: ${techColor(selectedEntity.layer)}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-950"
                >
                  <span
                    className="size-3.5 rounded-full border border-white/20"
                    style={{ backgroundColor: techColor(selectedEntity.layer) }}
                  />
                </div>

                {/* Botão de Visibilidade da Camada */}
                <button
                  type="button"
                  onClick={() => {
                    if (!setLayers || !activeLayerObj) return;
                    triggerHaptic("selection");
                    setLayers((prev) =>
                      prev.map((l) =>
                        l.id === activeLayerObj.id ? { ...l, visible: !l.visible } : l,
                      ),
                    );
                  }}
                  title={
                    activeLayerObj?.visible !== false
                      ? "Camada visível (clique para ocultar)"
                      : "Camada oculta (clique para exibir)"
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-300 hover:border-sky-500/50 hover:text-white cursor-pointer"
                >
                  {activeLayerObj?.visible !== false ? (
                    <Eye className="size-3.5 text-sky-400" />
                  ) : (
                    <EyeOff className="size-3.5 text-slate-500" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* E. AÇÕES RÁPIDAS: Editar, Duplicar, Array e Excluir (Vermelho reservado exclusivamente para Excluir) */}
          <div
            data-testid="properties-quick-actions"
            className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex flex-col gap-1.5"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Ações Rápidas
            </span>
            <div className="grid grid-cols-4 gap-1">
              {/* Editar */}
              <button
                type="button"
                data-testid="prop-action-edit"
                onClick={() => {
                  triggerHaptic("selection");
                  if (selectedEntity.type === "polyline") {
                    setActiveNumericProp({
                      key: "width",
                      label: "Largura (X)",
                      symbol: "W",
                      value: entityMetrics.width ?? 100,
                      unit: "mm",
                      min: 0.1,
                      defaultStep: 5,
                    });
                  } else if (selectedEntity.type === "circle" || selectedEntity.type === "arc") {
                    setActiveNumericProp({
                      key: "diameter",
                      label: "Diâmetro (Ø)",
                      symbol: "Ø",
                      value: selectedEntity.r * 2,
                      unit: "mm",
                      min: 0.1,
                      defaultStep: 1,
                    });
                  } else if (selectedEntity.type === "line") {
                    setActiveNumericProp({
                      key: "length",
                      label: "Comprimento (L)",
                      symbol: "L",
                      value: entityMetrics.perimeter,
                      unit: "mm",
                      min: 0.1,
                      defaultStep: 5,
                    });
                  } else {
                    setActiveNumericProp({
                      key: "posX",
                      label: "Posição X",
                      symbol: "X",
                      value: entityMetrics.posX,
                      unit: "mm",
                      defaultStep: 5,
                      allowNegative: true,
                    });
                  }
                }}
                className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-slate-700/80 bg-slate-950/90 py-1.5 font-mono text-[9px] font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors cursor-pointer"
              >
                <Edit3 className="size-3.5 text-sky-400" />
                <span>Editar</span>
              </button>

              {/* Duplicar */}
              <button
                type="button"
                data-testid="prop-action-duplicate"
                onClick={() => {
                  triggerHaptic("selection");
                  copyToGlobalClipboard(entities, [selectedEntity.id]);
                  const dup = translate(selectedEntity, 10, 10);
                  const newEnt = { ...dup, id: `ent_${Math.random().toString(36).slice(2, 9)}` };
                  onDuplicateEntity(newEnt);
                  setSelection([newEnt.id]);
                  toast.success("Entidade duplicada (+10, +10 mm).");
                }}
                className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-slate-700/80 bg-slate-950/90 py-1.5 font-mono text-[9px] font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors cursor-pointer"
              >
                <Copy className="size-3.5 text-sky-400" />
                <span>Duplicar</span>
              </button>

              {/* Array */}
              <button
                type="button"
                data-testid="prop-action-array"
                onClick={() => {
                  triggerHaptic("selection");
                  if (onOpenArray) {
                    onOpenArray();
                  } else if (onDivideEntity) {
                    onDivideEntity(selectedEntity);
                  }
                }}
                className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-slate-700/80 bg-slate-950/90 py-1.5 font-mono text-[9px] font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors cursor-pointer"
              >
                <Grid className="size-3.5 text-sky-400" />
                <span>Array</span>
              </button>

              {/* Excluir (Vermelho reservado exclusivamente para ação destrutiva) */}
              <button
                type="button"
                data-testid="prop-action-delete"
                onClick={() => {
                  triggerHaptic("warning");
                  onDeleteEntity(selectedEntity.id);
                  setSelection([]);
                }}
                className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-red-900/60 bg-red-950/40 py-1.5 font-mono text-[9px] font-semibold text-red-300 hover:border-red-500 hover:bg-red-900/60 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="size-3.5 text-red-400" />
                <span>Excluir</span>
              </button>
            </div>
          </div>

          {/* Modelagem Sólida 3D (+Z / Loft) recolhível para manter o painel enxuto */}
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-2 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => toggleSection("loft3d")}
              className="flex items-center justify-between text-left cursor-pointer"
            >
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-sky-400">
                Elevação +Z & Extrusão 3D
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded bg-sky-500/15 px-1 py-0.5 font-mono text-[8.5px] font-bold text-sky-300">
                  Z={getEntityElevationZ(selectedEntity).toFixed(0)}mm
                </span>
                {collapsedSections.loft3d ? (
                  <ChevronRight className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </div>
            </button>

            {!collapsedSections.loft3d && (
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="grid grid-cols-2 gap-1.5">
                  {renderGridCellField({
                    key: "elevationZ",
                    label: "Elevação Z",
                    symbol: "+Z",
                    value: getEntityElevationZ(selectedEntity),
                    unit: "mm",
                    defaultStep: 10,
                    stepOptions: [1, 5, 10, 20, 60],
                    allowNegative: true,
                  })}
                  {renderGridCellField({
                    key: "extrudeHeight",
                    label: "Extrusão 3D",
                    symbol: "H",
                    value: getEntityExtrudeHeight(selectedEntity, thickness),
                    unit: "mm",
                    defaultStep: 5,
                    stepOptions: [1, 2, 5, 10, 25],
                    min: 0,
                  })}
                </div>

                {isLoft3DEntity(selectedEntity) &&
                  (() => {
                    const spec = getEntityLoft3DSpec(selectedEntity);
                    if (!spec) return null;
                    return (
                      <div className="mt-1 flex flex-col gap-1.5 border-t border-slate-800 pt-1.5">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const rebuilt = createLoft3DEntity({
                                sectionEntities: spec.sectionEntities,
                                surfaceMode: "smooth",
                                bodyMode: spec.bodyMode,
                                wallThicknessMm: spec.wallThicknessMm,
                                layer: selectedEntity.layer,
                                existingId: selectedEntity.id,
                              });
                              if (rebuilt) onUpdateEntity(rebuilt);
                            }}
                            className={cn(
                              "rounded border py-1 font-mono text-[9px] font-bold",
                              spec.surfaceMode === "smooth"
                                ? "border-sky-400 bg-sky-500/25 text-white"
                                : "border-slate-700 bg-slate-950 text-slate-400",
                            )}
                          >
                            Suave
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const rebuilt = createLoft3DEntity({
                                sectionEntities: spec.sectionEntities,
                                surfaceMode: "ruled",
                                bodyMode: spec.bodyMode,
                                wallThicknessMm: spec.wallThicknessMm,
                                layer: selectedEntity.layer,
                                existingId: selectedEntity.id,
                              });
                              if (rebuilt) onUpdateEntity(rebuilt);
                            }}
                            className={cn(
                              "rounded border py-1 font-mono text-[9px] font-bold",
                              spec.surfaceMode === "ruled"
                                ? "border-sky-400 bg-sky-500/25 text-white"
                                : "border-slate-700 bg-slate-950 text-slate-400",
                            )}
                          >
                            Reto
                          </button>
                        </div>
                        {onDecomposeLoftEntity && (
                          <button
                            type="button"
                            onClick={() => onDecomposeLoftEntity(selectedEntity)}
                            className="rounded border border-amber-500/40 bg-amber-500/15 py-1 font-mono text-[9px] font-bold text-amber-300"
                          >
                            Decompor Perfis ({spec.sectionEntities.length})
                          </button>
                        )}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CASO 3: MULTISELEÇÃO → PROPRIEDADES E AÇÕES EM LOTE COMPACTAS         */}
      {/* ===================================================================== */}
      {selectedEntities.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-900/80 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <Layers className="size-3" />
              </div>
              <span className="font-sans text-[11px] font-bold text-white">
                Conjunto Selecionado
              </span>
            </div>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-sky-300">
              {selectedEntities.length} itens
            </span>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2 flex items-center justify-between font-mono text-[9.5px] text-slate-300">
            <span>L: {overallBounds.width.toFixed(1)} mm</span>
            <span>•</span>
            <span>A: {overallBounds.height.toFixed(1)} mm</span>
          </div>

          <ChamferStructuralProfileCard
            entities={selectedEntities}
            onUpdateEntity={onUpdateEntity}
          />

          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                copyToGlobalClipboard(entities, selection);
                toast.success("Seleção copiada.");
              }}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-slate-700 bg-slate-950 py-1.5 font-mono text-[9px] font-semibold text-slate-200 hover:border-sky-500/50 cursor-pointer"
            >
              <Copy className="size-3.5 text-sky-400" />
              <span>Copiar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onOpenArray?.();
              }}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-slate-700 bg-slate-950 py-1.5 font-mono text-[9px] font-semibold text-slate-200 hover:border-sky-500/50 cursor-pointer"
            >
              <Grid className="size-3.5 text-sky-400" />
              <span>Array</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("warning");
                for (const ent of selectedEntities) {
                  onDeleteEntity(ent.id);
                }
                setSelection([]);
              }}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-red-900/60 bg-red-950/40 py-1.5 font-mono text-[9px] font-semibold text-red-300 hover:bg-red-900/60 cursor-pointer"
            >
              <Trash2 className="size-3.5 text-red-400" />
              <span>Excluir</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
