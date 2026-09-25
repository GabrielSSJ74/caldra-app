/**
 * CALDRA CAD — CHAMFER CAD PANEL (FASE 08)
 *
 * Painel lateral interativo da Árvore de Recursos Paramétrica e Controle de Estados CAD:
 * 3D Dobrado ↔ 2D Planificado ↔ Percurso CNC / G-Code
 */

import { useState } from "react";
import {
  Layers,
  Box,
  FileCode2,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Flame,
  FileText,
  Columns,
  Download,
  LayoutGrid,
  Hammer,
  ShieldCheck,
  X,
} from "lucide-react";
import type { PartDocument, CADViewState } from "@/lib/cad/kernel/types";
import { ChamferKernel } from "@/lib/cad/kernel/chamferKernel";
import { DrawingExporter } from "@/lib/cad/drafting/drawingExporter";
import { NestingDxfExporter } from "@/lib/cad/nesting/nestingDxfExporter";
import { cn } from "@/lib/utils";

interface ChamferCADPanelProps {
  open: boolean;
  onClose: () => void;
  document: PartDocument;
  onDocumentChange: (updated: PartDocument) => void;
}

export function ChamferCADPanel({
  open,
  onClose,
  document: doc,
  onDocumentChange,
}: ChamferCADPanelProps) {
  const [isRebuilding, setIsRebuilding] = useState(false);

  if (!open) return null;

  const features = doc.featureTree.getFeatures();

  const handleToggleState = (newState: CADViewState) => {
    if (newState === "2D_FLAT") {
      const updated = ChamferKernel.unfold(doc);
      onDocumentChange({ ...updated });
    } else if (newState === "3D_FOLDED") {
      const updated = ChamferKernel.fold(doc);
      onDocumentChange({ ...updated });
    } else if (newState === "CAM_TOOLPATH") {
      const updated = ChamferKernel.generateCAM(doc);
      onDocumentChange({ ...updated });
    } else if (newState === "2D_DRAWING") {
      ChamferKernel.generateTechnicalDrawing(doc);
      onDocumentChange({ ...doc });
    } else if (newState === "WELDMENTS") {
      if (!doc.structuralReport) {
        ChamferKernel.generateWeldmentCutList(doc);
      }
      doc.activeState = "WELDMENTS";
      onDocumentChange({ ...doc });
    } else if (newState === "NESTING") {
      if (!doc.nestingJob) {
        ChamferKernel.generateNesting(doc);
      }
      doc.activeState = "NESTING";
      onDocumentChange({ ...doc });
    } else if (newState === "FORMING") {
      if (!doc.pressBrakeSimulation) {
        ChamferKernel.simulatePressBrake(doc);
      }
      ChamferKernel.rebuildForming(doc);
      doc.activeState = "FORMING";
      onDocumentChange({ ...doc });
    } else if (newState === "DFM") {
      ChamferKernel.auditDfm(doc);
      doc.activeState = "DFM";
      onDocumentChange({ ...doc });
    }
  };

  const handleRebuild = () => {
    setIsRebuilding(true);
    setTimeout(() => {
      const { doc: updated } = ChamferKernel.rebuild(doc, {
        generateFlatPattern: doc.activeState === "2D_FLAT",
        generateCamToolpath: doc.activeState === "CAM_TOOLPATH",
      });
      if (doc.activeState === "2D_DRAWING") {
        ChamferKernel.generateTechnicalDrawing(updated);
      }
      onDocumentChange({ ...updated });
      setIsRebuilding(false);
    }, 150);
  };

  const handleDownloadGCode = () => {
    const updated = doc.gcode ? doc : ChamferKernel.generateCAM(doc);
    if (!updated.gcode) return;

    const blob = new Blob([updated.gcode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${doc.name.toLowerCase().replace(/\s+/g, "_")}.nc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDrawingSVG = () => {
    const drawing = doc.technicalDrawing || ChamferKernel.generateTechnicalDrawing(doc);
    const svg = DrawingExporter.exportToSVG(drawing);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `prancha_${doc.name.toLowerCase().replace(/\s+/g, "_")}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDrawingDXF = () => {
    const drawing = doc.technicalDrawing || ChamferKernel.generateTechnicalDrawing(doc);
    const dxf = DrawingExporter.exportToDXF(drawing);
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `prancha_${doc.name.toLowerCase().replace(/\s+/g, "_")}.dxf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCutListCSV = () => {
    const report = doc.structuralReport || ChamferKernel.generateWeldmentCutList(doc);
    let csv =
      "Item,Perfil,Material,Comprimento_mm,Qtd,Angulo1,Angulo2,Massa_Linear_kg_m,Massa_Total_kg\n";
    report.cutList.forEach((it) => {
      csv += `${it.itemNumber},"${it.profileDesignation}","${it.material}",${it.cutLengthMm},${it.quantity},${it.angle1Deg},${it.angle2Deg},${it.linearMassKgM},${it.totalMassKg}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `cutlist_${doc.name.toLowerCase().replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadNestingDXF = () => {
    const job = doc.nestingJob || ChamferKernel.generateNesting(doc);
    if (!job.sheets.length) return;
    const dxf = ChamferKernel.exportNestingDxf(doc, 1);
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `nesting_chapa_${doc.name.toLowerCase().replace(/\s+/g, "_")}.dxf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadNestingCSV = () => {
    const job = doc.nestingJob || ChamferKernel.generateNesting(doc);
    const csv = NestingDxfExporter.generateReportCsv(job);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `aproveitamento_chapa_${doc.name.toLowerCase().replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPressBrakeCSV = () => {
    const sim = doc.pressBrakeSimulation || ChamferKernel.simulatePressBrake(doc);
    let csv = "CALDRA CAD — RELATORIO DE CONFORMACAO E PRENSA DOBRADEIRA\n";
    csv += `Peca;${doc.name};Material;${sim.material};Espessura (mm);${sim.thicknessMm}\n`;
    csv += `Comprimento Dobra (mm);${sim.bendLengthMm};Angulo Desejado;${sim.targetAngleDeg} graus\n`;
    csv += `Canal V Utilizado (mm);${sim.dieOpeningVMm};V Recomendado;${sim.recommendedDieOpeningVMm} mm\n`;
    csv += `Raio Puncao (mm);${sim.punchRadiusMm};Raio Interno Natural;${sim.naturalInsideRadiusMm} mm\n`;
    csv += `Forca por Metro (ton/m);${sim.tonnagePerMeterTonM};Tonelagem Total (ton);${sim.totalTonnageTon}\n`;
    csv += `Retorno Elastico / Springback;${sim.springbackAngleDeg} graus;Angulo Penetracao / Sobredobra;${sim.overbendAngleDeg} graus\n`;
    csv += `Aba Minima Recomendada (mm);${sim.minFlangeLengthMm}\n\n`;

    csv += "RECURSOS DE CONFORMACAO / FERRAMENTAL\n";
    csv += "TIPO;NOME;CODIGO FERRAMENTAL;DESCRICAO\n";
    if (doc.formingResult && doc.formingResult.formingToolCount > 0) {
      [
        ...doc.formingResult.gussetAnnotations,
        ...doc.formingResult.louverAnnotations,
        ...doc.formingResult.embossAnnotations,
      ].forEach((ann) => {
        csv += `${ann.toolType};"${ann.name}";"${ann.toolingCode}";"${ann.notes}"\n`;
      });
    } else {
      csv += "PADRAO;Dobra Convencional em Prensa;V-DIE_STANDARD;Dobra a ar com matriz V\n";
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `simulacao_dobra_${doc.name.toLowerCase().replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDfmCSV = () => {
    const csv = ChamferKernel.exportDfmReportCsv(doc);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `dfm_custos_${doc.name.toLowerCase().replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDfmDXF = () => {
    const dxf = ChamferKernel.exportDfmDxf(doc);
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `dfm_auditoria_${doc.name.toLowerCase().replace(/\s+/g, "_")}.dxf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 bottom-0 z-[85] flex w-80 flex-col border-l border-line bg-background/95 backdrop-blur-md shadow-2xl transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-label="Painel CAD Kernel"
    >
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-accent" />
          <h2 className="font-mono text-xs font-semibold tracking-wider uppercase text-foreground">
            Árvore CAD · Chamfer
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fechar painel CAD"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* SELETOR DE MODO DE VISUALIZAÇÃO */}
      <div className="grid grid-cols-4 gap-1 border-b border-line bg-muted/20 p-1.5">
        <button
          type="button"
          onClick={() => handleToggleState("3D_FOLDED")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "3D_FOLDED"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Box className="mb-1 size-3.5" />
          3D
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("2D_FLAT")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "2D_FLAT"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Layers className="mb-1 size-3.5" />
          PLANO
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("CAM_TOOLPATH")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "CAM_TOOLPATH"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Flame className="mb-1 size-3.5" />
          CNC
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("2D_DRAWING")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "2D_DRAWING"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <FileText className="mb-1 size-3.5" />
          FOLHA
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("WELDMENTS")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "WELDMENTS"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Columns className="mb-1 size-3.5" />
          PERFIS
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("NESTING")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "NESTING"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <LayoutGrid className="mb-1 size-3.5" />
          CHAPA
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("FORMING")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "FORMING"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Hammer className="mb-1 size-3.5" />
          ESTAMPO
        </button>
        <button
          type="button"
          onClick={() => handleToggleState("DFM")}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg p-1.5 font-mono text-[7.5px] tracking-wider transition-colors",
            doc.activeState === "DFM"
              ? "bg-accent/15 text-accent font-semibold border border-accent/30"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <ShieldCheck className="mb-1 size-3.5" />
          DFM
        </button>
      </div>

      {/* METADADOS DA PEÇA */}
      <div className="grid grid-cols-2 gap-2 border-b border-line p-3 font-mono text-[11px]">
        <div className="rounded-lg border border-line bg-card/40 p-2">
          <span className="text-[10px] text-muted-foreground block">ESPESSURA</span>
          <span className="font-semibold text-foreground">{doc.thickness.toFixed(2)} mm</span>
        </div>
        <div className="rounded-lg border border-line bg-card/40 p-2">
          <span className="text-[10px] text-muted-foreground block">FATOR K</span>
          <span className="font-semibold text-foreground">{doc.kFactor.toFixed(3)}</span>
        </div>
      </div>

      {/* ÁRVORE PARAMÉTRICA DE RECURSOS */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Recursos ({features.length})
          </span>
          <button
            type="button"
            onClick={handleRebuild}
            disabled={isRebuilding}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", isRebuilding && "animate-spin")} />
            Rebuild
          </button>
        </div>

        <ul className="space-y-1.5">
          {features.map((feat) => {
            const isSuppressed = feat.isSuppressed;
            return (
              <li
                key={feat.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-line/60 bg-card/30 p-2 transition-colors",
                  isSuppressed && "opacity-40 bg-muted/20",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {feat.state === "VALID" ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                  ) : feat.state === "STALE" ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <Box className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-mono text-xs text-foreground">{feat.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    {feat.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      doc.featureTree.suppressFeature(feat.id, !isSuppressed);
                      onDocumentChange({ ...doc });
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title={isSuppressed ? "Ativar recurso" : "Suprimir recurso"}
                  >
                    {isSuppressed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* RODAPÉ COM AÇÕES DE EXPORTAÇÃO CNC & PRANCHA TÉCNICA */}
      <div className="border-t border-line bg-muted/20 p-3 space-y-1.5">
        <button
          type="button"
          onClick={handleDownloadGCode}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 font-mono text-xs font-semibold text-accent-foreground uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          <FileCode2 className="size-3.5" />
          Baixar G-Code CNC (.NC)
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadDrawingSVG}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[10px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Download className="size-3" />
            Prancha (SVG)
          </button>
          <button
            type="button"
            onClick={handleDownloadDrawingDXF}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[10px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Download className="size-3" />
            Prancha (DXF)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadNestingDXF}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[10px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Download className="size-3" />
            Chapa (DXF)
          </button>
          <button
            type="button"
            onClick={handleDownloadNestingCSV}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[10px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <LayoutGrid className="size-3" />
            Nesting (CSV)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadCutListCSV}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[9px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Columns className="size-3" />
            Perfis (CSV)
          </button>
          <button
            type="button"
            onClick={handleDownloadPressBrakeCSV}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[9px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Hammer className="size-3" />
            Dobra/Estampo
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadDfmCSV}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[9px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <ShieldCheck className="size-3 text-emerald-500" />
            DFM (CSV)
          </button>
          <button
            type="button"
            onClick={handleDownloadDfmDXF}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-card/60 px-2 py-1.5 font-mono text-[9px] font-semibold text-foreground uppercase tracking-wider hover:bg-muted transition-colors"
          >
            <Download className="size-3 text-emerald-500" />
            DFM (DXF)
          </button>
        </div>
      </div>
    </aside>
  );
}
