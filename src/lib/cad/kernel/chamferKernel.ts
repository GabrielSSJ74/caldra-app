// @ts-nocheck
/**
 * CALDRA CAD — UNIFIED KERNEL (FASE 08)
 *
 * Núcleo mestre unificado do CAD CHAMFER.
 * Orquestra todo o fluxo paramétrico industrial do CALDRA:
 * PROJETAR → MODELAR 3D → PARAMETRIZAR → CONVERTER EM CHAPA → DOBRAR → DESDOBRAR → PLANIFICAR → FABRICAR CNC
 */

import {
  type CanonicalModel,
  type Solid,
  createRectangleSketch,
  extrudeSketchToSolid,
} from "../canonical";
import { FeatureTree } from "../features/featureTree";
import type { RebuildReport } from "../features/types";
import { SheetMetalEngine } from "../sheetmetal";
import { CAMEngine } from "../cam/camEngine";
import { GCodePostProcessor } from "../cam/gcodePostProcessor";
import type { MachineConfig } from "../cam/types";
import type { Entity } from "@/lib/lab2d/core";
import { ChamferBridge } from "./chamferBridge";
import { DraftingEngine, type DraftingOptions, type TechnicalDrawingSheet } from "../drafting";
import {
  StructuralEngine,
  type ProfileSection,
  type ProfileAlignment,
  type CornerTreatmentType,
  type StructuralMember,
  type StructuralFrameReport,
} from "../weldments";
import {
  NestingEngine,
  NestingDxfExporter,
  type NestingBlank,
  type NestingOptions,
  type NestingJobResult,
} from "../nesting";
import {
  HemEngine,
  FormingEngine,
  PressBrakeSimulator,
  type SheetMetalGussetDef,
  type SheetMetalLouverDef,
  type SheetMetalEmbossDef,
  type SheetMetalHemDef,
  type SheetMetalJogDef,
  type PressBrakeSimulationInput,
  type PressBrakeSimulationResult,
  type FormingEngineResult,
  type SheetMetalGrade,
} from "../forming";
import {
  DfmEngine,
  DfmCostEngine,
  DfmReportExporter,
  type DfmAuditResult,
  type DfmFullReport,
  type DfmRuleConfig,
  type FabricationCostRates,
} from "../dfm";
import type { Vector3D } from "../canonical";
import type { PartDocument, RebuildKernelOptions } from "./types";

export class ChamferKernel {
  /**
   * Cria um novo documento de peça CAD paramétrica no CALDRA.
   */
  static createDocument(
    nameOrOptions:
      | string
      | { name?: string; thickness?: number; material?: string; kFactor?: number } = "Nova Peça Paramétrica",
    thicknessArg = 2.0,
    materialArg = "Aço Carbono SAE 1020",
    kFactorArg = 0.44,
  ): PartDocument {
    const isObj = typeof nameOrOptions === "object" && nameOrOptions !== null;
    const name = isObj ? (nameOrOptions.name || "Nova Peça Paramétrica") : nameOrOptions;
    const thickness = isObj ? (nameOrOptions.thickness ?? 2.0) : thicknessArg;
    const material = isObj ? (nameOrOptions.material || "Aço Carbono SAE 1020") : materialArg;
    const kFactor = isObj ? (nameOrOptions.kFactor ?? 0.44) : kFactorArg;

    const featureTree = new FeatureTree(name);
    const canonicalModel = featureTree.model;

    return {
      id: `doc_${Date.now()}`,
      name,
      thickness,
      material,
      density: 7.85,
      kFactor,
      innerRadius: thickness,
      featureTree,
      canonicalModel,
      activeState: "3D_FOLDED",
      entities2D: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Importa o desenho 2D do canvas do CHAMFER como um Sketch paramétrico na Feature Tree.
   */
  static addSketchFromEntities(
    doc: PartDocument,
    entities: Entity[],
    sketchName = "Perfil Base",
  ): PartDocument {
    const { sketch } = ChamferBridge.entitiesToSketch(entities, sketchName);

    doc.featureTree.addFeature({
      id: sketch.id,
      name: sketchName,
      type: "sketch",
      parameters: { sketch },
      references: [doc.featureTree.features[0]?.id ?? "ref_plane_xy"],
    });

    doc.entities2D = [...entities];
    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Extrusa o perfil em chapa sólida com a espessura configurada.
   */
  static extrudeBasePlate(doc: PartDocument, widthMm = 100, lengthMm = 100): PartDocument {
    const t = doc.thickness;

    // Garante que o recurso de sketch esteja na árvore paramétrica antes da extrusão
    let sketchFeat = doc.featureTree.features.find((f) => f.type === "sketch");
    if (!sketchFeat) {
      sketchFeat = doc.featureTree.addFeature({
        id: `sketch_base_${Date.now()}`,
        name: `Esboço Base (${widthMm}×${lengthMm})`,
        type: "sketch",
        parameters: { width: widthMm, height: lengthMm },
        references: [doc.featureTree.features[0]?.id ?? "ref_plane_xy"],
      });
    }

    const sketch = createRectangleSketch(widthMm, lengthMm, { x: 0, y: 0 }, "Perfil Base");
    const solid = extrudeSketchToSolid(sketch, t, doc.material, doc.density);

    doc.activeSolid = solid;
    doc.canonicalModel.bodies.push(solid);

    doc.featureTree.addFeature({
      id: `extrude_${Date.now()}`,
      name: `Chapa Base (${widthMm}×${lengthMm})`,
      type: "extrude",
      parameters: { widthMm, lengthMm, depth: t },
      references: [sketchFeat.id],
      dependencies: [sketchFeat.id],
    });

    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Adiciona uma dobra de chapa metálica com cálculo analítico de dedução/compensação.
   */
  static addBend(
    doc: PartDocument,
    bendParams: {
      angleDeg: number;
      flangeLengthMm: number;
      bendLinePositionMm: number;
      innerRadius?: number;
    },
  ): PartDocument {
    const ir = bendParams.innerRadius ?? doc.innerRadius;
    const ba = SheetMetalEngine.computeBendAllowance(
      bendParams.angleDeg,
      ir,
      doc.kFactor,
      doc.thickness,
    );
    const bd = SheetMetalEngine.computeBendDeduction(
      bendParams.angleDeg,
      ir,
      doc.kFactor,
      doc.thickness,
    );
    const ossb = SheetMetalEngine.computeOutsideSetback(bendParams.angleDeg, ir, doc.thickness);

    doc.featureTree.addFeature({
      id: `bend_${Date.now()}`,
      name: `Dobra ${bendParams.angleDeg}° R${ir}`,
      type: "bend",
      parameters: {
        ...bendParams,
        insideRadius: ir,
        bendAllowance: ba,
        bendDeduction: bd,
        outsideSetback: ossb,
      },
      dependencies: doc.featureTree
        .getFeatures()
        .slice(-1)
        .map((f) => f.id),
    });

    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Desdobra o modelo em sua planificação técnica 2D (Flat Pattern).
   */
  static unfold(doc: PartDocument): PartDocument {
    const smPart = {
      id: doc.id,
      name: doc.name,
      thickness: doc.thickness,
      defaultKFactor: doc.kFactor,
      defaultBendRadius: doc.innerRadius,
      material: doc.material,
      density: doc.density,
      baseWidth: 100,
      baseLength: 100,
      flanges: [
        {
          id: "flange_01",
          edgeId: "right",
          length: 50,
          angleDeg: 90,
          insideRadius: doc.innerRadius,
          materialPosition: "INSIDE" as const,
        },
      ],
      isUnfolded: true,
    };

    const flatResult = SheetMetalEngine.generateFlatPattern(smPart);

    const bendEntities: Entity[] = flatResult.bendLines.map((bl) => ({
      id: `bend_line_${bl.id}`,
      type: "line",
      x1: bl.startPoint.x,
      y1: bl.startPoint.y,
      x2: bl.endPoint.x,
      y2: bl.endPoint.y,
      layer: "DOBRA",
    }));

    doc.flatPatternResult = flatResult;
    doc.entities2D = [...flatResult.contourEntities, ...bendEntities];
    doc.activeState = "2D_FLAT";
    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Dobra o modelo de volta ao estado volumétrico tridimensional.
   */
  static fold(doc: PartDocument): PartDocument {
    doc.activeState = "3D_FOLDED";
    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Gera percurso de corte CAM e pós-processamento G-Code industrial.
   */
  static generateCAM(doc: PartDocument, machineConfig?: MachineConfig): PartDocument {
    // Se o documento estiver dobrado, planifica temporariamente para extrair contornos 2D
    const entities = doc.entities2D.length > 0 ? doc.entities2D : this.unfold(doc).entities2D;

    const cuttingParams = {
      technology: "LASER" as const,
      sheetThicknessMm: doc.thickness,
      kerfWidthMm: 0.2,
      feedrateMmMin: 2800,
      rapidSpeedMmMin: 18000,
      pierceTimeSec: 0.35,
      gasPressureBar: 1.0,
      powerWatts: 3000,
    };

    const toolpath = CAMEngine.generateToolpath(entities, cuttingParams);
    const gcode = GCodePostProcessor.generateGCode(toolpath, cuttingParams);

    doc.camResult = toolpath;
    doc.gcode = gcode;
    doc.activeState = "CAM_TOOLPATH";
    doc.updatedAt = Date.now();
    return doc;
  }

  /**
   * Reexecuta a reconstrução paramétrica (rebuild) de todo o documento CAD.
   */
  static rebuild(
    doc: PartDocument,
    opts?: RebuildKernelOptions,
  ): { doc: PartDocument; report: RebuildReport } {
    const report = doc.featureTree.rebuild();

    if (opts?.generateFlatPattern) {
      this.unfold(doc);
    }
    if (opts?.generateCamToolpath) {
      this.generateCAM(doc, opts.machineConfig);
    }

    doc.updatedAt = Date.now();
    return { doc, report };
  }

  /**
   * Gera a prancha técnica 2D com vistas ortográficas, tabela de dobras e bloco de título ABNT.
   */
  static generateTechnicalDrawing(
    doc: PartDocument,
    options?: DraftingOptions,
  ): TechnicalDrawingSheet {
    const drawing = DraftingEngine.generateDrawing(doc, options);
    doc.technicalDrawing = drawing;
    doc.activeState = "2D_DRAWING";
    doc.updatedAt = Date.now();
    return drawing;
  }

  /**
   * Adiciona um perfil estrutural ao documento (vigas, tubos, cantoneiras).
   */
  static addStructuralMember(
    doc: PartDocument,
    params: {
      profile: ProfileSection;
      startPoint: Vector3D;
      endPoint: Vector3D;
      alignment?: ProfileAlignment;
      rotationDeg?: number;
      name?: string;
    },
  ): StructuralMember {
    const member = StructuralEngine.createMember(params);
    if (!doc.structuralMembers) {
      doc.structuralMembers = [];
    }
    doc.structuralMembers.push(member);
    doc.activeState = "WELDMENTS";
    doc.updatedAt = Date.now();
    return member;
  }

  /**
   * Aplica tratamento de cantos (esquadria, topo ou copagem) entre membros.
   */
  static applyCornerTreatment(
    doc: PartDocument,
    memberAId: string,
    memberBId: string,
    treatment: CornerTreatmentType,
    weldGapMm = 1.5,
  ): void {
    if (!doc.structuralMembers) return;
    const idxA = doc.structuralMembers.findIndex((m) => m.id === memberAId);
    const idxB = doc.structuralMembers.findIndex((m) => m.id === memberBId);
    if (idxA === -1 || idxB === -1) return;

    const res = StructuralEngine.applyCornerTreatment(
      doc.structuralMembers[idxA],
      doc.structuralMembers[idxB],
      treatment,
      weldGapMm,
    );

    doc.structuralMembers[idxA] = res.memberA;
    doc.structuralMembers[idxB] = res.memberB;
    doc.updatedAt = Date.now();
  }

  /**
   * Gera a lista de corte (Cut List) e relatório de aproveitamento de barras.
   */
  static generateWeldmentCutList(
    doc: PartDocument,
    standardBarLengthMeters = 6.0,
  ): StructuralFrameReport {
    const members = doc.structuralMembers || [];
    const report = StructuralEngine.generateCutList(doc.name, members, standardBarLengthMeters);
    doc.structuralReport = report;
    doc.updatedAt = Date.now();
    return report;
  }

  /**
   * Executa o aninhamento industrial de blanks na chapa e calcula aproveitamento e retalhos.
   */
  static generateNesting(
    doc: PartDocument,
    additionalBlanks: NestingBlank[] = [],
    options?: Partial<NestingOptions>,
  ): NestingJobResult {
    const blanks: NestingBlank[] = [...additionalBlanks];

    if (doc.flatPatternResult) {
      blanks.unshift({
        id: doc.id,
        name: doc.name,
        width: doc.flatPatternResult.blankWidth,
        height: doc.flatPatternResult.blankLength,
        quantity: 1,
        thickness: doc.thickness,
        material: doc.material,
      });
    } else {
      blanks.unshift({
        id: doc.id,
        name: doc.name,
        width: 150,
        height: 100,
        quantity: 1,
        thickness: doc.thickness,
        material: doc.material,
      });
    }

    const job = NestingEngine.runNesting(blanks, options);
    doc.nestingJob = job;
    doc.activeState = "NESTING";
    doc.updatedAt = Date.now();
    return job;
  }

  /**
   * Exporta a prancha de aninhamento para DXF industrial compatível com CypCut.
   */
  static exportNestingDxf(doc: PartDocument, sheetIndex = 1): string {
    if (!doc.nestingJob || doc.nestingJob.sheets.length === 0) {
      throw new Error("Nenhum aninhamento calculado para exportar DXF.");
    }
    const sheet =
      doc.nestingJob.sheets.find((s) => s.sheetIndex === sheetIndex) ?? doc.nestingJob.sheets[0];
    return NestingDxfExporter.exportSheetToDxf(sheet);
  }

  /**
   * Adiciona uma nervura de reforço em dobra (Gusset).
   */
  static addGusset(doc: PartDocument, gusset: SheetMetalGussetDef): void {
    if (!doc.gussets) doc.gussets = [];
    doc.gussets.push(gusset);
    this.rebuildForming(doc);
  }

  /**
   * Adiciona uma veneziana de respiro (Louver).
   */
  static addLouver(doc: PartDocument, louver: SheetMetalLouverDef): void {
    if (!doc.louvers) doc.louvers = [];
    doc.louvers.push(louver);
    this.rebuildForming(doc);
  }

  /**
   * Adiciona um estampo, repuxo ou escareado (Emboss / Countersink).
   */
  static addEmboss(doc: PartDocument, emboss: SheetMetalEmbossDef): void {
    if (!doc.embosses) doc.embosses = [];
    doc.embosses.push(emboss);
    this.rebuildForming(doc);
  }

  /**
   * Adiciona uma bainha industrial (Hem Flange).
   */
  static addHem(doc: PartDocument, hem: SheetMetalHemDef): void {
    if (!doc.hems) doc.hems = [];
    doc.hems.push(hem);
    const hemRes = HemEngine.calculateHem(hem);
    if (doc.flatPatternResult) {
      doc.flatPatternResult.bendLines.push(...hemRes.bendLines);
      doc.flatPatternResult.contourEntities.push(...hemRes.flatPatternEntities);
    }
    this.rebuildForming(doc);
  }

  /**
   * Adiciona um degrau de chapa (Jog Flange).
   */
  static addJog(doc: PartDocument, jog: SheetMetalJogDef): void {
    if (!doc.jogs) doc.jogs = [];
    doc.jogs.push(jog);
    const jogRes = HemEngine.calculateJog(jog);
    if (doc.flatPatternResult) {
      doc.flatPatternResult.bendLines.push(...jogRes.bendLines);
      doc.flatPatternResult.contourEntities.push(...jogRes.flatPatternEntities);
    }
    this.rebuildForming(doc);
  }

  /**
   * Regenera e consolida todos os recursos de conformação da peça.
   */
  static rebuildForming(doc: PartDocument): FormingEngineResult {
    const bendLines =
      doc.flatPatternResult?.bendLines.map((b) => ({
        id: b.id,
        start: b.startPoint,
        end: b.endPoint,
      })) ?? [];

    const result = FormingEngine.consolidateForming(
      doc.gussets || [],
      doc.louvers || [],
      doc.embosses || [],
      bendLines,
    );

    doc.formingResult = result;
    if (doc.activeState === "FORMING") {
      doc.entities2D = [
        ...(doc.flatPatternResult?.contourEntities || []),
        ...result.allFlatPatternEntities,
      ];
    }
    doc.updatedAt = Date.now();
    return result;
  }

  /**
   * Executa a simulação de prensagem, cálculo de tonelagem e retorno elástico (springback).
   */
  static simulatePressBrake(
    doc: PartDocument,
    options?: Partial<PressBrakeSimulationInput>,
  ): PressBrakeSimulationResult {
    let grade: SheetMetalGrade = "A36";
    const mat = (doc.material || "").toUpperCase();
    if (mat.includes("INOX") || mat.includes("304")) grade = "INOX_304";
    else if (mat.includes("316")) grade = "INOX_316";
    else if (mat.includes("ALU") || mat.includes("5052")) grade = "ALU_5052";
    else if (mat.includes("GALV") || mat.includes("ZINC")) grade = "GALVANIZED";
    else if (mat.includes("1020")) grade = "SAE1020";

    const bendLength =
      options?.bendLengthMm ??
      (doc.flatPatternResult?.blankLength || doc.flatPatternResult?.blankWidth || 1000);

    const targetAngle = options?.targetAngleDeg ?? 90;

    const input: PressBrakeSimulationInput = {
      material: options?.material ?? grade,
      thicknessMm: options?.thicknessMm ?? doc.thickness,
      bendLengthMm: bendLength,
      dieOpeningVMm: options?.dieOpeningVMm,
      punchRadiusMm: options?.punchRadiusMm ?? doc.innerRadius,
      targetAngleDeg: targetAngle,
    };

    const sim = PressBrakeSimulator.simulate(input);
    doc.pressBrakeSimulation = sim;
    doc.updatedAt = Date.now();
    return sim;
  }

  /**
   * Executa a auditoria DFM completa e orçamentação analítica da peça.
   */
  static auditDfm(
    doc: PartDocument,
    configOverride?: Partial<DfmRuleConfig>,
    ratesOverride?: Partial<FabricationCostRates>,
  ): DfmFullReport {
    if (!doc.sheetMetal) {
      doc.sheetMetal = {
        thickness: doc.thickness,
        material: doc.material,
        defaultBendRadius: doc.innerRadius,
        bends: (doc.flatPatternResult?.bendAnnotations || []).map((b, idx) => ({
          id: b.bendId || `BEND_${idx + 1}`,
          start: b.start,
          end: b.end,
          angle: b.angleDeg,
          direction: b.direction,
        })),
        flatPattern: doc.flatPatternResult
          ? {
              width: doc.flatPatternResult.blankWidth,
              height: doc.flatPatternResult.blankLength,
              innerLoops: [],
            }
          : undefined,
      };
    }
    if (!doc.solid && doc.activeSolid) {
      doc.solid = doc.activeSolid;
    }
    if (!doc.forming) {
      doc.forming = {
        embosses: doc.embosses,
        gussets: doc.gussets,
        louvers: doc.louvers,
        hems: doc.hems,
        jogs: doc.jogs,
      };
    }

    const audit = DfmEngine.audit(doc, configOverride);
    const cost = DfmCostEngine.calculate(doc, ratesOverride);

    const report: DfmFullReport = {
      partName: doc.name || doc.header?.name || "Peça Caldra",
      audit,
      cost,
      generatedAt: new Date().toISOString(),
    };

    doc.dfmReport = report;
    doc.updatedAt = Date.now();
    return report;
  }

  /**
   * Exporta relatório de DFM e Custos em CSV.
   */
  static exportDfmReportCsv(doc: PartDocument): string {
    const report = doc.dfmReport || this.auditDfm(doc);
    return DfmReportExporter.generateCsv(report);
  }

  /**
   * Exporta arquivo DXF com marcações e círculos na camada DFM_ISSUES.
   */
  static exportDfmDxf(doc: PartDocument): string {
    const report = doc.dfmReport || this.auditDfm(doc);
    return DfmReportExporter.generateDxfWithDfmLayer(doc, report.audit);
  }
}
