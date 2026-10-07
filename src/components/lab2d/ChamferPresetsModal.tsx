/**
 * CALDRA CHAMFER — MODAL DE PRESETS PARAMÉTRICOS DE CALDEIRARIA (ETAPA 33)
 *
 * Gera geometrias reais e editáveis a partir do catálogo industrial:
 *  - Flange Circular DIN/ANSI com furação polar;
 *  - Sapata / Placa Base com furos nos cantos;
 *  - Tubo Estrutural Metalon;
 *  - Chapa com Rasgos Oblongos (Slots).
 */

import React, { useState } from "react";
import {
  Boxes,
  Check,
  Disc,
  FolderPlus,
  Maximize2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import {
  CAD_PRESETS_CATALOG,
  type PresetDefinition,
} from "@/lib/lab2d/cadPresetsCatalog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

interface ChamferPresetsModalProps {
  open: boolean;
  onClose: () => void;
  insertPosition: Vec2;
  onInsertEntities: (entities: Entity[]) => void;
}

export function ChamferPresetsModal({
  open,
  onClose,
  insertPosition,
  onInsertEntities,
}: ChamferPresetsModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<PresetDefinition>(
    CAD_PRESETS_CATALOG[0]!,
  );
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    CAD_PRESETS_CATALOG[0]?.params.forEach((p) => {
      init[p.id] = p.defaultValue;
    });
    return init;
  });

  const handleSelectPreset = (preset: PresetDefinition) => {
    setSelectedPreset(preset);
    const newVals: Record<string, number> = {};
    preset.params.forEach((p) => {
      newVals[p.id] = p.defaultValue;
    });
    setParamValues(newVals);
    triggerHaptic("selection");
  };

  const handleParamChange = (id: string, val: number) => {
    setParamValues((prev) => ({ ...prev, [id]: val }));
  };

  const handleInsert = () => {
    triggerHaptic("success");
    AudioManager.play("cad_core_init");
    const generated = selectedPreset.generate(paramValues, insertPosition);
    onInsertEntities(generated);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-card/95 border-border/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-accent">
            <Boxes className="w-5 h-5" />
            <DialogTitle className="text-base font-bold tracking-tight">
              Catálogo de Presets Paramétricos CALDRA
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Insere componentes industriais com geometria real e totalmente editável.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Lista lateral de presets */}
          <div className="space-y-1.5 border-r border-border/40 pr-2">
            {CAD_PRESETS_CATALOG.map((p) => {
              const isSel = p.id === selectedPreset.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left p-2 rounded-xl text-xs font-semibold transition-all ${
                    isSel
                      ? "bg-accent text-accent-foreground shadow-md"
                      : "hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <div className="truncate">{p.name}</div>
                  <div className="text-[10px] opacity-75 capitalize font-normal">
                    {p.category}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Editor de parâmetros do preset */}
          <div className="sm:col-span-2 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {selectedPreset.name}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedPreset.description}
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {selectedPreset.params.map((par) => (
                <div key={par.id} className="flex items-center justify-between gap-3 text-xs">
                  <label className="text-muted-foreground font-medium truncate flex-1">
                    {par.label}:
                  </label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={par.min}
                      max={par.max}
                      value={paramValues[par.id] ?? par.defaultValue}
                      onChange={(e) =>
                        handleParamChange(par.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-20 px-2 py-1 text-right font-mono text-xs bg-background border border-border rounded-lg outline-none focus:border-accent"
                    />
                    <span className="text-[11px] text-muted-foreground font-mono w-6 text-left">
                      {par.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-border/40 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleInsert}
            className="brand-gradient text-background font-semibold text-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Inserir Geometria no Projeto</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
