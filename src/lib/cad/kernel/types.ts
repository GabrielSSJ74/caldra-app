/**
 * CALDRA CAD — UNIFIED KERNEL TYPES (FASE 08)
 *
 * Tipos centrais do documento paramétrico do CAD CHAMFER,
 * orquestrando a árvore de recursos, geometria canônica B-Rep,
 * desdobramento de chapa metálica, caldeiraria e fabricação CAM/CNC.
 */

import type { CanonicalModel, Solid } from "../canonical";
import type { FeatureTree } from "../features/featureTree";
import type { FlatPatternResult } from "../sheetmetal/types";
import type { ToolpathResult, MachineConfig } from "../cam/types";
import type { TechnicalDrawingSheet } from "../drafting/types";
import type { StructuralMember, StructuralFrameReport } from "../weldments/types";
import type { NestingJobResult } from "../nesting/types";
import type {
  SheetMetalGussetDef,
  SheetMetalLouverDef,
  SheetMetalEmbossDef,
  SheetMetalHemDef,
  SheetMetalJogDef,
  PressBrakeSimulationResult,
  FormingEngineResult,
} from "../forming/types";
import type { Entity } from "@/lib/lab2d/core";
import type { DfmFullReport } from "../dfm/types";

export type CADViewState =
  | "3D_FOLDED"
  | "2D_FLAT"
  | "CAM_TOOLPATH"
  | "2D_DRAWING"
  | "WELDMENTS"
  | "NESTING"
  | "FORMING"
  | "DFM";

export interface PartDocument {
  id: string;
  name: string;
  header?: { name?: string };
  thickness: number;
  material: string;
  density: number; // g/cm³ (default: 7.85)
  kFactor: number; // default: 0.44
  innerRadius: number;
  featureTree: FeatureTree;
  canonicalModel: CanonicalModel;
  activeState: CADViewState;
  activeSolid?: Solid;
  solid?: Solid;
  sheetMetal?: any;
  forming?: any;
  flatPatternResult?: FlatPatternResult;
  camResult?: ToolpathResult;
  gcode?: string;
  technicalDrawing?: TechnicalDrawingSheet;
  structuralMembers?: StructuralMember[];
  structuralReport?: StructuralFrameReport;
  nestingJob?: NestingJobResult;
  gussets?: SheetMetalGussetDef[];
  louvers?: SheetMetalLouverDef[];
  embosses?: SheetMetalEmbossDef[];
  hems?: SheetMetalHemDef[];
  jogs?: SheetMetalJogDef[];
  pressBrakeSimulation?: PressBrakeSimulationResult;
  formingResult?: FormingEngineResult;
  dfmReport?: DfmFullReport;
  entities2D: Entity[]; // Entidades no plano para o canvas do CHAMFER
  createdAt: number;
  updatedAt: number;
}

export interface RebuildKernelOptions {
  autoSolveConstraints?: boolean;
  generateFlatPattern?: boolean;
  generateCamToolpath?: boolean;
  machineConfig?: MachineConfig;
}
