/**
 * CALDRA CHAMFER CAD — ABA "ENG. REV." (ENGENHARIA REVERSA E BANCADA MECÂNICA)
 * Acoplada na Janela Lateral Direita (ChamferRightSidebar).
 *
 * Implementa na Fase B:
 * - Assistente Guiado "Reconstruir Peça" (Etapas A → F)
 * - Categoria 1: Referências (VISION 1:1) — Múltiplas imagens, 2 pontos, Múltiplas referências
 *   por mínimos quadrados com tabela de resíduos, Scanner DPI conferido, Homografia 4 pontos
 *   e gerador de Folha de Calibração Chamfer 1:1 (SVG).
 * - Categoria 2: Caderno de Medições — Paquímetro, trena, micrômetro, incerteza ±mm,
 *   vínculo com entidade selecionada, discrepância nominal × medido e status de confiança.
 * - Categoria 3: Captura de Contorno e Ajustes Ortogonais — Captura de pontos no canvas,
 *   ajuste ortogonal de Reta, Círculo, Arco (sem viés de arco curto), Polilinha RDP e Spline
 *   com prévia ao vivo de RMS (mm), Desvio Máx (mm) e Nº de pontos antes do commit.
 */

import React, { useState, useRef, useMemo } from "react";
import {
  ScanEye,
  Ruler,
  Crosshair,
  Check,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  CircleDot,
  Compass,
  Minus,
  PenLine,
  Upload,
  Link2,
  Unlink,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { uid, type Entity, type Vec2 } from "@/lib/lab2d/core";
import {
  REV_ENG_STATUS_META,
  REV_ENG_WIZARD_STEPS,
  REV_ENG_VIEW_TAG_LABELS,
  MEASUREMENT_KIND_LABELS,
  MEASUREMENT_INSTRUMENT_META,
  type RevEngPlanData,
  type RevEngCategoryId,
  type RevEngWizardStep,
  type RevEngReferenceImage,
  type RevEngImageViewTag,
  type RevEngInfoStatus,
  type CalibrationMethod,
  type MeasurementKind,
  type MeasurementInstrument,
  type MeasurementRecord,
  type FittedPrimitiveCandidate,
  type RevEngCanvasInteractionMode,
} from "@/lib/lab2d/revEngTypes";
import {
  calibrateByTwoPoints,
  calibrateByMultipleReferences,
  calibrateByScannerDpi,
  computeRectifiedHomography,
  generateCalibrationSheetSvg,
} from "@/lib/lab2d/revEngCalibration";
import {
  buildFittedCandidate,
  syncMeasurementsWithEntities,
} from "@/lib/lab2d/revEngFitting";
import { ChamferDirectDimensionEditor } from "../ChamferDirectDimensionEditor";
import { ChamferRevEngBenchPanels } from "./ChamferRevEngBenchPanels";
import {
  ChamferRevEngCategory3Extras,
  ChamferRevEngContourPocketPanels,
} from "./ChamferRevEngContourPocketPanels";
import { ChamferRevEng25DPanel } from "./ChamferRevEng25DPanel";
import type { LayerId } from "@/lib/lab2d/core";

export interface ChamferRevEngTabProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (updater: RevEngPlanData | ((prev: RevEngPlanData) => RevEngPlanData)) => void;
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  commit: (updater: Entity[] | ((prev: Entity[]) => Entity[])) => void;
  activeLayer: string;
  thickness: number;
  onThicknessChange: (th: number) => void;
  // Interação com o Canvas CAD
  canvasInteractionMode: RevEngCanvasInteractionMode;
  onSetCanvasInteractionMode: (mode: RevEngCanvasInteractionMode) => void;
  pendingPickPointsWorld: Vec2[];
  onClearPendingPickPoints: () => void;
  fittedPreviewCandidate: FittedPrimitiveCandidate | null;
  onSetFittedPreviewCandidate: (cand: FittedPrimitiveCandidate | null) => void;
  onOpenVisionModal?: () => void;
  isDark?: boolean;
}

interface KeypadRequest {
  label: string;
  currentValue: number;
  unit: "mm" | "°";
  allowNegative?: boolean;
  screenPos: { x: number; y: number };
  onConfirm: (val: number) => void;
}

export function ChamferRevEngTab({
  revEng,
  onChangeRevEng,
  entities,
  selection,
  setSelection,
  commit,
  activeLayer,
  thickness,
  onThicknessChange,
  canvasInteractionMode,
  onSetCanvasInteractionMode,
  pendingPickPointsWorld,
  onClearPendingPickPoints,
  fittedPreviewCandidate,
  onSetFittedPreviewCandidate,
  onOpenVisionModal,
  isDark = true,
}: ChamferRevEngTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [keypadReq, setKeypadReq] = useState<KeypadRequest | null>(null);

  // Estado local para calibração de referência
  const [calKnownMm, setCalKnownMm] = useState<number>(100);
  const [calAxisHint, setCalAxisHint] = useState<"free" | "horizontal" | "vertical">("free");
  const [calLabel, setCalLabel] = useState<string>("Cota Ref");
  const [scannerDpiInput, setScannerDpiInput] = useState<number>(300);
  const [scannerCheckMm, setScannerCheckMm] = useState<number>(100);
  const [homogWidthMm, setHomogWidthMm] = useState<number>(170);
  const [homogHeightMm, setHomogHeightMm] = useState<number>(240);

  // Estado local para nova medição no Caderno
  const [newMeasKind, setNewMeasKind] = useState<MeasurementKind>("comprimento");
  const [newMeasInstrument, setNewMeasInstrument] = useState<MeasurementInstrument>("paquimetro");
  const [newMeasValue, setNewMeasValue] = useState<number>(100);
  const [newMeasUncertainty, setNewMeasUncertainty] = useState<number>(0.05);
  const [newMeasStatus, setNewMeasStatus] = useState<RevEngInfoStatus>("MEDIDO");
  const [newMeasLabel, setNewMeasLabel] = useState<string>("");

  // Estado local para ajuste de contorno
  const [fitClosedContour, setFitClosedContour] = useState<boolean>(false);
  const [fitTargetLayer, setFitTargetLayer] = useState<string>("corte");

  const activeImage = useMemo(
    () =>
      revEng.referenceImages.find((img) => img.id === revEng.activeReferenceImageId) ??
      revEng.referenceImages[0] ??
      null,
    [revEng.referenceImages, revEng.activeReferenceImageId],
  );

  // Medições sincronizadas com os valores nominais atuais das entidades
  const syncedMeasurements = useMemo(
    () => syncMeasurementsWithEntities(revEng.measurements, entities, thickness),
    [revEng.measurements, entities, thickness],
  );

  const openKeypad = (
    ev: React.MouseEvent | React.PointerEvent,
    reqOrLabel: Omit<KeypadRequest, "screenPos"> | string,
    currentValueArg?: number,
    unitArg?: "mm" | "°" | "dpi" | "",
    onConfirmArg?: (val: number) => void,
    allowNegativeArg?: boolean,
  ) => {
    triggerHaptic("selection");
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const screenPos = {
      x: Math.max(140, rect.left - 120),
      y: Math.min(window.innerHeight - 240, Math.max(80, rect.top)),
    };

    if (typeof reqOrLabel === "string") {
      setKeypadReq({
        label: reqOrLabel,
        currentValue: Number.isFinite(currentValueArg) ? (currentValueArg as number) : 0,
        unit: unitArg === "°" ? "°" : "mm",
        allowNegative: allowNegativeArg,
        onConfirm: onConfirmArg ?? (() => {}),
        screenPos,
      });
      return;
    }

    setKeypadReq({
      ...reqOrLabel,
      currentValue: Number.isFinite(reqOrLabel.currentValue) ? reqOrLabel.currentValue : 0,
      screenPos,
    });
  };

  const handleSelectWizardStep = (step: RevEngWizardStep) => {
    triggerHaptic("selection");
    const stepDef = REV_ENG_WIZARD_STEPS.find((s) => s.id === step);
    onChangeRevEng((prev) => ({
      ...prev,
      activeWizardStep: step,
      activeCategory: stepDef ? stepDef.targetCategory : prev.activeCategory,
      updatedAt: Date.now(),
    }));
  };

  const handleToggleCategory = (catId: RevEngCategoryId) => {
    triggerHaptic("selection");
    onChangeRevEng((prev) => ({
      ...prev,
      activeCategory: prev.activeCategory === catId ? prev.activeCategory : catId,
      updatedAt: Date.now(),
    }));
  };

  const updateActiveImage = (patch: Partial<RevEngReferenceImage>) => {
    if (!activeImage) return;
    onChangeRevEng((prev) => ({
      ...prev,
      referenceImages: prev.referenceImages.map((img) =>
        img.id === activeImage.id ? { ...img, ...patch } : img,
      ),
      updatedAt: Date.now(),
    }));
  };

  // Upload de nova imagem de referência 1:1
  const handleFileUpload = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      const imgEl = new Image();
      imgEl.onload = () => {
        const natW = imgEl.naturalWidth || 1000;
        const natH = imgEl.naturalHeight || 800;
        const defaultMmPerPx = 0.25;
        const newImg: RevEngReferenceImage = {
          id: `refimg-${uid()}`,
          name: file.name.replace(/\.[^.]+$/, "") || `Vista ${revEng.referenceImages.length + 1}`,
          viewTag: "superior",
          src: dataUrl,
          naturalWidthPx: natW,
          naturalHeightPx: natH,
          xMm: 0,
          yMm: 0,
          widthMm: Number((natW * defaultMmPerPx).toFixed(2)),
          heightMm: Number((natH * defaultMmPerPx).toFixed(2)),
          rotationDeg: 0,
          opacity: 0.55,
          contrast: 1.0,
          thresholdMode: "normal",
          thresholdLevel: 128,
          visible: true,
          locked: false,
          calibrationMode: "two_points",
          mmPerPx: defaultMmPerPx,
          residualErrorMm: 0,
          calibrationStatus: "nao_calibrada",
          references: [],
          infoStatus: "ESTIMADO",
        };
        onChangeRevEng((prev) => ({
          ...prev,
          referenceImages: [...prev.referenceImages, newImg],
          activeReferenceImageId: newImg.id,
          updatedAt: Date.now(),
        }));
        toast.success(`Imagem "${newImg.name}" adicionada. Calibre a escala 1:1 para medir.`);
      };
      imgEl.src = dataUrl;
    };
    reader.readAsDataURL(file);
    ev.target.value = "";
  };

  // Cria gabarito sintético 1:1 de bancada para calibração / teste rápido
  const handleAddSyntheticReference = () => {
    triggerHaptic("action");
    const sheet = generateCalibrationSheetSvg({
      sheetTitle: "GABARITO DE REFERÊNCIA 1:1",
      quadWidthMm: 170,
      quadHeightMm: 240,
      barLengthMm: 100,
    });
    const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(sheet.svgContent)}`;
    const newImg: RevEngReferenceImage = {
      id: `refimg-${uid()}`,
      name: `Folha 1:1 (${revEng.referenceImages.length + 1})`,
      viewTag: "superior",
      src: encoded,
      naturalWidthPx: 840,
      naturalHeightPx: 1188,
      xMm: 0,
      yMm: 0,
      widthMm: 210,
      heightMm: 297,
      rotationDeg: 0,
      opacity: 0.5,
      contrast: 1.0,
      thresholdMode: "normal",
      thresholdLevel: 128,
      visible: true,
      locked: false,
      calibrationMode: "calibration_sheet",
      mmPerPx: 0.25,
      residualErrorMm: 0,
      calibrationStatus: "ok",
      references: [],
      infoStatus: "CALIBRADO" as unknown as RevEngInfoStatus,
    };
    newImg.infoStatus = "MEDIDO";
    onChangeRevEng((prev) => ({
      ...prev,
      referenceImages: [...prev.referenceImages, newImg],
      activeReferenceImageId: newImg.id,
      updatedAt: Date.now(),
    }));
    toast.success("Folha de Referência 1:1 carregada no plano (210 × 297 mm).");
  };

  // Download da Folha de Calibração Chamfer 1:1 em SVG
  const handleDownloadCalibrationSheet = () => {
    triggerHaptic("action");
    const sheet = generateCalibrationSheetSvg();
    const blob = new Blob([sheet.svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Folha_Calibracao_Chamfer_1_1.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Folha de Calibração Chamfer 1:1 exportada (imprimir em escala 100%).");
  };

  // Aplica calibração de 2 pontos capturados no canvas
  const handleApplyTwoPointCalibration = () => {
    if (!activeImage) {
      toast.info("Adicione ou selecione uma imagem de referência primeiro.");
      return;
    }
    if (pendingPickPointsWorld.length < 2) {
      toast.info("Toque em 2 pontos conhecidos sobre a imagem no canvas.");
      return;
    }
    const p1World = pendingPickPointsWorld[0]!;
    const p2World = pendingPickPointsWorld[1]!;
    // Converte a distância medida no mundo atual para pixels naturais da imagem ativa
    const curMmPerPx = activeImage.mmPerPx > 0 ? activeImage.mmPerPx : 0.25;
    const p1Px: Vec2 = {
      x: (p1World.x - activeImage.xMm) / curMmPerPx,
      y: (p1World.y - activeImage.yMm) / curMmPerPx,
    };
    const p2Px: Vec2 = {
      x: (p2World.x - activeImage.xMm) / curMmPerPx,
      y: (p2World.y - activeImage.yMm) / curMmPerPx,
    };

    try {
      const fit = calibrateByTwoPoints(p1Px, p2Px, calKnownMm, calAxisHint);
      updateActiveImage({
        mmPerPx: fit.mmPerPx,
        widthMm: Number((activeImage.naturalWidthPx * fit.mmPerPx).toFixed(3)),
        heightMm: Number((activeImage.naturalHeightPx * fit.mmPerPx).toFixed(3)),
        rotationDeg:
          calAxisHint !== "free"
            ? Number((activeImage.rotationDeg + fit.rotationDeg).toFixed(2))
            : activeImage.rotationDeg,
        residualErrorMm: 0,
        calibrationStatus: "ok",
        infoStatus: "MEDIDO",
      });
      onClearPendingPickPoints();
      onSetCanvasInteractionMode("none");
      triggerHaptic("success");
      toast.success(fit.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao calibrar 2 pontos.");
    }
  };

  // Adiciona uma linha de referência à lista de Múltiplas Referências (Mínimos Quadrados)
  const handleAddMultiReferenceLine = () => {
    if (!activeImage) return;
    if (pendingPickPointsWorld.length < 2) {
      toast.info("Toque em 2 pontos no canvas para registrar esta referência.");
      return;
    }
    const p1World = pendingPickPointsWorld[0]!;
    const p2World = pendingPickPointsWorld[1]!;
    const curMmPerPx = activeImage.mmPerPx > 0 ? activeImage.mmPerPx : 0.25;
    const p1Px: Vec2 = {
      x: (p1World.x - activeImage.xMm) / curMmPerPx,
      y: (p1World.y - activeImage.yMm) / curMmPerPx,
    };
    const p2Px: Vec2 = {
      x: (p2World.x - activeImage.xMm) / curMmPerPx,
      y: (p2World.y - activeImage.yMm) / curMmPerPx,
    };

    const nextRefs = [
      ...activeImage.references,
      {
        id: `calref-${uid()}`,
        label: calLabel.trim() || `Ref #${activeImage.references.length + 1}`,
        p1Px,
        p2Px,
        knownLengthMm: calKnownMm,
        axisHint: calAxisHint,
      },
    ];

    try {
      const fit = calibrateByMultipleReferences(nextRefs, 0.5);
      updateActiveImage({
        references: nextRefs,
        mmPerPx: fit.mmPerPx,
        widthMm: Number((activeImage.naturalWidthPx * fit.mmPerPx).toFixed(3)),
        heightMm: Number((activeImage.naturalHeightPx * fit.mmPerPx).toFixed(3)),
        residualErrorMm: Number(fit.rmsErrorMm.toFixed(3)),
        calibrationStatus: fit.status,
        infoStatus: fit.status === "incompativel" ? "ESTIMADO" : "AJUSTADO",
      });
      onClearPendingPickPoints();
      triggerHaptic("success");
      if (fit.status === "incompativel") {
        toast.warning(fit.message);
      } else {
        toast.success(fit.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ajustar múltiplas referências.");
    }
  };

  // Aplica calibração por Scanner DPI
  const handleApplyScannerDpi = () => {
    if (!activeImage) return;
    try {
      let checkPxSpan: number | undefined;
      if (pendingPickPointsWorld.length >= 2) {
        const dWorld = Math.hypot(
          pendingPickPointsWorld[1]!.x - pendingPickPointsWorld[0]!.x,
          pendingPickPointsWorld[1]!.y - pendingPickPointsWorld[0]!.y,
        );
        const curMmPerPx = activeImage.mmPerPx > 0 ? activeImage.mmPerPx : 25.4 / scannerDpiInput;
        checkPxSpan = dWorld / curMmPerPx;
      }
      const fit = calibrateByScannerDpi(scannerDpiInput, scannerCheckMm, checkPxSpan);
      updateActiveImage({
        scannerDpi: scannerDpiInput,
        scannerCheckMeasuredMm: scannerCheckMm,
        mmPerPx: fit.mmPerPx,
        widthMm: Number((activeImage.naturalWidthPx * fit.mmPerPx).toFixed(3)),
        heightMm: Number((activeImage.naturalHeightPx * fit.mmPerPx).toFixed(3)),
        residualErrorMm: Number(fit.rmsErrorMm.toFixed(3)),
        calibrationStatus: fit.status,
        infoStatus: fit.status === "ok" ? "MEDIDO" : "ESTIMADO",
      });
      onClearPendingPickPoints();
      onSetCanvasInteractionMode("none");
      toast.success(fit.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na calibração por DPI.");
    }
  };

  // Aplica retificação por Homografia 4 Pontos
  const handleApplyHomography4Pt = () => {
    if (!activeImage) return;
    if (pendingPickPointsWorld.length < 4) {
      toast.info(`Toque nos 4 cantos conhecidos no canvas (${pendingPickPointsWorld.length}/4).`);
      return;
    }
    const curMmPerPx = activeImage.mmPerPx > 0 ? activeImage.mmPerPx : 0.25;
    const cornersPx = pendingPickPointsWorld.slice(0, 4).map((pt) => ({
      x: (pt.x - activeImage.xMm) / curMmPerPx,
      y: (pt.y - activeImage.yMm) / curMmPerPx,
    })) as [Vec2, Vec2, Vec2, Vec2];

    try {
      const homog = computeRectifiedHomography(cornersPx, homogWidthMm, homogHeightMm);
      const rectifiedMmPerPx = homogWidthMm / Math.max(1, activeImage.naturalWidthPx);
      updateActiveImage({
        homography: {
          id: homog.id,
          cornersPx: homog.cornersPx,
          realWidthMm: homog.realWidthMm,
          realHeightMm: homog.realHeightMm,
          residualRmsMm: homog.residualRmsMm,
          maxCornerErrorMm: homog.maxCornerErrorMm,
          matrixH: homog.matrixH,
        },
        widthMm: homogWidthMm,
        heightMm: homogHeightMm,
        mmPerPx: rectifiedMmPerPx,
        residualErrorMm: Number(homog.residualRmsMm.toFixed(4)),
        calibrationStatus: homog.maxCornerErrorMm <= 0.2 ? "ok" : "alerta",
        infoStatus: "AJUSTADO",
      });
      onClearPendingPickPoints();
      onSetCanvasInteractionMode("none");
      triggerHaptic("success");
      toast.success(
        `Homografia 4 pontos calculada (${homogWidthMm} × ${homogHeightMm} mm · RMS ${homog.residualRmsMm.toFixed(3)} mm).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao calcular homografia.");
    }
  };

  // Adiciona medição ao Caderno de Medições
  const handleAddMeasurement = () => {
    triggerHaptic("action");
    const kindMeta = MEASUREMENT_KIND_LABELS[newMeasKind];
    const code = `M${String(revEng.measurements.length + 1).padStart(2, "0")}`;
    const linkedEntityId = selection.length === 1 ? selection[0] : undefined;

    const record: MeasurementRecord = {
      id: `meas-${uid()}`,
      code,
      label: newMeasLabel.trim() || `${kindMeta.label}`,
      kind: newMeasKind,
      valueMmOrDeg: newMeasValue,
      unit: kindMeta.defaultUnit,
      uncertaintyMmOrDeg: newMeasUncertainty,
      instrument: newMeasInstrument,
      linkedEntityId,
      infoStatus: newMeasStatus,
      createdAt: Date.now(),
    };

    onChangeRevEng((prev) => ({
      ...prev,
      measurements: [...prev.measurements, record],
      updatedAt: Date.now(),
    }));
    setNewMeasLabel("");

    if (newMeasKind === "espessura") {
      onThicknessChange(newMeasValue);
      toast.success(`${code}: Espessura da chapa atualizada para ${newMeasValue.toFixed(2)} mm.`);
    } else {
      toast.success(`${code} registrada no Caderno (${newMeasValue.toFixed(2)} ${kindMeta.defaultUnit}).`);
    }
  };

  // Aplica o valor de uma medição diretamente sobre a entidade CAD vinculada
  const handleApplyMeasurementToEntity = (m: MeasurementRecord) => {
    if (m.kind === "espessura") {
      onThicknessChange(m.valueMmOrDeg);
      triggerHaptic("success");
      toast.success(`Espessura ajustada para ${m.valueMmOrDeg.toFixed(2)} mm (${m.code}).`);
      return;
    }

    const targetId = m.linkedEntityId ?? (selection.length === 1 ? selection[0] : undefined);
    if (!targetId) {
      toast.info("Selecione ou vincule uma entidade (linha, círculo ou arco) para aplicar a cota.");
      return;
    }

    const targetEnt = entities.find((e) => e.id === targetId);
    if (!targetEnt) {
      toast.info("A entidade vinculada não foi encontrada no plano atual.");
      return;
    }

    commit((prev) =>
      prev.map((e) => {
        if (e.id !== targetId) return e;
        if (e.type === "line" && m.unit === "mm") {
          const curLen = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
          if (curLen < 1e-6) return e;
          const ux = (e.x2 - e.x1) / curLen;
          const uy = (e.y2 - e.y1) / curLen;
          return {
            ...e,
            x2: e.x1 + ux * m.valueMmOrDeg,
            y2: e.y1 + uy * m.valueMmOrDeg,
            params: { ...e.params, revEngStatus: m.infoStatus, measurementCode: m.code },
          };
        }
        if (e.type === "circle" && m.unit === "mm") {
          const nextR = m.kind === "raio" ? m.valueMmOrDeg : m.valueMmOrDeg / 2;
          return {
            ...e,
            r: Math.max(0.1, nextR),
            params: { ...e.params, revEngStatus: m.infoStatus, measurementCode: m.code },
          };
        }
        if (e.type === "arc" && m.unit === "mm") {
          const nextR = m.kind === "diametro" ? m.valueMmOrDeg / 2 : m.valueMmOrDeg;
          return {
            ...e,
            r: Math.max(0.1, nextR),
            params: { ...e.params, revEngStatus: m.infoStatus, measurementCode: m.code },
          };
        }
        return e;
      }),
    );
    triggerHaptic("success");
    toast.success(`Medida ${m.code} (${m.valueMmOrDeg.toFixed(2)} ${m.unit}) aplicada na geometria.`);
  };

  // Executa o ajuste ortogonal sobre os pontos capturados e gera prévia ao vivo
  const handleRunGeometricFit = (
    kind: "line" | "circle" | "arc" | "polyline_rdp" | "spline",
  ) => {
    const pts = revEng.capturedPoints.map((cp) => ({ x: cp.x, y: cp.y }));
    const minPts = kind === "line" || kind === "polyline_rdp" ? 2 : 3;
    if (pts.length < minPts) {
      toast.info(`Capture pelo menos ${minPts} pontos no canvas para ajustar esta primitiva.`);
      return;
    }
    try {
      const cand = buildFittedCandidate(
        pts,
        kind,
        revEng.rdpToleranceMm,
        fitClosedContour,
        fitTargetLayer || activeLayer,
      );
      onSetFittedPreviewCandidate(cand);
      triggerHaptic("selection");
      if (cand.collinearWarning) {
        toast.warning(cand.collinearWarning);
      } else {
        toast.info(
          `Prévia: ${cand.summaryLabel} · RMS ${cand.rmsMm.toFixed(3)} mm (Máx ${cand.maxDeviationMm.toFixed(3)} mm).`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ajustar primitiva.");
    }
  };

  // Insere definitivamente a primitiva ajustada no desenho CAD (com Undo/Redo)
  const handleCommitFittedCandidate = () => {
    if (!fittedPreviewCandidate) return;
    const newEnt: Entity = {
      ...fittedPreviewCandidate.entityPreview,
      id: uid(),
      layer: fitTargetLayer || activeLayer,
    };
    commit((prev) => [...prev, newEnt]);
    setSelection([newEnt.id]);
    onSetFittedPreviewCandidate(null);
    triggerHaptic("success");
    toast.success(`✓ ${fittedPreviewCandidate.summaryLabel} inserido no desenho CAD.`);
  };

  const multiRefEvaluation = useMemo(() => {
    if (!activeImage || activeImage.references.length === 0) return null;
    try {
      return calibrateByMultipleReferences(activeImage.references, 0.5);
    } catch {
      return null;
    }
  }, [activeImage]);

  const cardClass = cn(
    "rounded-xl border p-2.5 transition-all",
    isDark
      ? "border-[#293444] bg-[#0D121B]/90 text-[#E6EDF5]"
      : "border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]",
  );

  const numBtnClass = cn(
    "inline-flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
    isDark
      ? "border-[#38BDF8]/40 bg-[#151C27] text-[#38BDF8] hover:border-[#38BDF8] hover:bg-[#1E293B]"
      : "border-[#0284C7]/40 bg-[#FFFFFF] text-[#0284C7] hover:border-[#0284C7]",
  );

  return (
    <div className="flex flex-col gap-2.5 pb-6 font-mono text-xs select-none">
      {/* INPUT OCULTO PARA UPLOAD DE IMAGEM 1:1 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* =================================================================== */}
      {/* 1. ASSISTENTE GUIADO "RECONSTRUIR PEÇA" (ETAPAS A → F)              */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[#E11D48]" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Assistente: Reconstruir Peça
            </span>
          </div>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
              isDark ? "bg-[#E11D48]/20 text-[#FB7185]" : "bg-[#E11D48]/10 text-[#E11D48]",
            )}
          >
            Etapa {revEng.activeWizardStep}/F
          </span>
        </div>

        {/* Pílulas das Etapas A..F */}
        <div className="grid grid-cols-3 gap-1 mb-2">
          {REV_ENG_WIZARD_STEPS.map((step) => {
            const isCur = revEng.activeWizardStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleSelectWizardStep(step.id)}
                className={cn(
                  "rounded-lg px-1.5 py-1 text-[9.5px] font-bold transition-all truncate text-center cursor-pointer border",
                  isCur
                    ? "bg-[#E11D48] text-white border-[#E11D48] shadow-xs"
                    : isDark
                      ? "bg-[#151C27] border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                      : "bg-[#FFFFFF] border-[#CBD5E1] text-[#64748B] hover:text-[#1E293B]",
                )}
                title={step.title}
              >
                {step.shortTitle}
              </button>
            );
          })}
        </div>

        {/* Descrição da etapa ativa */}
        {(() => {
          const activeStepDef =
            REV_ENG_WIZARD_STEPS.find((s) => s.id === revEng.activeWizardStep) ??
            REV_ENG_WIZARD_STEPS[0]!;
          return (
            <div
              className={cn(
                "rounded-lg p-2 border text-[10px] leading-snug",
                isDark
                  ? "bg-[#151C27]/80 border-[#293444] text-[#94A3B8]"
                  : "bg-[#FFFFFF] border-[#CBD5E1] text-[#475569]",
              )}
            >
              <div className={cn("font-bold mb-0.5", isDark ? "text-[#E6EDF5]" : "text-[#1E293B]")}>
                {activeStepDef.title}
              </div>
              <p>{activeStepDef.description}</p>
            </div>
          );
        })()}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIA 1: REFERÊNCIAS (CHAMFER VISION 1:1)                       */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => handleToggleCategory("referencias")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <ScanEye className="size-3.5 text-[#E11D48]" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              1. Referências (VISION 1:1)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#94A3B8]">
              {revEng.referenceImages.length} img
            </span>
            {revEng.activeCategory === "referencias" ? (
              <ChevronDown className="size-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="size-3.5 text-[#94A3B8]" />
            )}
          </div>
        </button>

        {revEng.activeCategory === "referencias" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/60 pt-2">
            {/* Botões de importação e Folha de Calibração 1:1 */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white px-2 py-1.5 text-[10px] font-bold shadow-xs cursor-pointer"
              >
                <Upload className="size-3" />
                <span>+ Foto / Scanner</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCalibrationSheet}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold cursor-pointer",
                  isDark
                    ? "border-[#38BDF8]/40 bg-[#38BDF8]/12 text-[#38BDF8] hover:bg-[#38BDF8]/20"
                    : "border-[#0284C7]/40 bg-[#0284C7]/10 text-[#0284C7]",
                )}
                title="Baixar Folha de Calibração Chamfer 1:1 em SVG para imprimir em escala 100%"
              >
                <Download className="size-3" />
                <span>Folha 1:1 (SVG)</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddSyntheticReference}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1 text-[9.5px] font-semibold cursor-pointer",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#94A3B8] hover:text-[#E6EDF5]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                )}
              >
                + Inserir Gabarito 1:1 no Canvas
              </button>
              {onOpenVisionModal && (
                <button
                  type="button"
                  onClick={onOpenVisionModal}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[9.5px] font-semibold cursor-pointer",
                    isDark
                      ? "border-[#293444] bg-[#151C27] text-[#94A3B8] hover:text-[#E6EDF5]"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                  )}
                  title="Abrir vetorizador automático de silhuetas"
                >
                  Auto-Vetor
                </button>
              )}
            </div>

            {/* Lista de imagens de referência carregadas no plano */}
            {revEng.referenceImages.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[9.5px] font-bold uppercase text-[#94A3B8]">
                  Vistas Calibradas ({revEng.referenceImages.length})
                </span>
                {revEng.referenceImages.map((img) => {
                  const isSel = activeImage?.id === img.id;
                  return (
                    <div
                      key={img.id}
                      onClick={() =>
                        onChangeRevEng((prev) => ({ ...prev, activeReferenceImageId: img.id }))
                      }
                      className={cn(
                        "flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] cursor-pointer transition-colors",
                        isSel
                          ? isDark
                            ? "border-[#38BDF8]/60 bg-[#38BDF8]/12 text-[#E6EDF5]"
                            : "border-[#0284C7] bg-[#0284C7]/10 text-[#1E293B]"
                          : isDark
                            ? "border-[#293444] bg-[#151C27]/60 text-[#94A3B8]"
                            : "border-[#CBD5E1] bg-[#FFFFFF] text-[#64748B]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{img.name}</div>
                        <div className="text-[8.5px] opacity-80">
                          {REV_ENG_VIEW_TAG_LABELS[img.viewTag]} · {img.mmPerPx.toFixed(4)} mm/px
                        </div>
                      </div>

                      <span
                        className={cn(
                          "rounded px-1 py-0.5 text-[8px] font-bold uppercase",
                          img.calibrationStatus === "ok"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : img.calibrationStatus === "incompativel"
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-amber-500/20 text-amber-400",
                        )}
                      >
                        {img.calibrationStatus === "ok"
                          ? "1:1 OK"
                          : img.calibrationStatus === "incompativel"
                            ? "ERRO"
                            : "PEND"}
                      </span>

                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onChangeRevEng((prev) => ({
                            ...prev,
                            referenceImages: prev.referenceImages.map((x) =>
                              x.id === img.id ? { ...x, visible: !x.visible } : x,
                            ),
                          }));
                        }}
                        className="p-0.5 hover:text-white"
                        title={img.visible ? "Ocultar imagem" : "Mostrar imagem"}
                      >
                        {img.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onChangeRevEng((prev) => ({
                            ...prev,
                            referenceImages: prev.referenceImages.map((x) =>
                              x.id === img.id ? { ...x, locked: !x.locked } : x,
                            ),
                          }));
                        }}
                        className="p-0.5 hover:text-white"
                        title={img.locked ? "Desbloquear imagem" : "Bloquear imagem"}
                      >
                        {img.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onChangeRevEng((prev) => {
                            const nextList = prev.referenceImages.filter((x) => x.id !== img.id);
                            return {
                              ...prev,
                              referenceImages: nextList,
                              activeReferenceImageId:
                                prev.activeReferenceImageId === img.id
                                  ? nextList[0]?.id ?? null
                                  : prev.activeReferenceImageId,
                            };
                          });
                        }}
                        className="p-0.5 text-rose-400 hover:text-rose-300"
                        title="Remover imagem de referência"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Controles detalhados da Imagem Ativa */}
            {activeImage && (
              <div className="flex flex-col gap-2 rounded-lg border border-[#293444]/80 bg-[#151C27]/50 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-bold text-[#38BDF8] truncate">
                    {activeImage.name}
                  </span>
                  <select
                    value={activeImage.viewTag}
                    onChange={(e) =>
                      updateActiveImage({ viewTag: e.target.value as RevEngImageViewTag })
                    }
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[9.5px] font-bold outline-none",
                      isDark
                        ? "border-[#293444] bg-[#0D121B] text-[#E6EDF5]"
                        : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                    )}
                  >
                    {Object.entries(REV_ENG_VIEW_TAG_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Opacidade e Posição / Rotação via Teclado Numérico */}
                <div className="flex items-center justify-between gap-2 text-[9.5px]">
                  <span className="text-[#94A3B8]">Opacidade: {Math.round(activeImage.opacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={activeImage.opacity}
                    onChange={(e) => updateActiveImage({ opacity: Number(e.target.value) })}
                    className="w-24 accent-[#E11D48]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Posição X da Imagem (mm)",
                        currentValue: activeImage.xMm,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: (val) => updateActiveImage({ xMm: val }),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">X:</span>
                    <span>{activeImage.xMm.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Posição Y da Imagem (mm)",
                        currentValue: activeImage.yMm,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: (val) => updateActiveImage({ yMm: val }),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Y:</span>
                    <span>{activeImage.yMm.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Rotação da Imagem (°)",
                        currentValue: activeImage.rotationDeg,
                        unit: "°",
                        allowNegative: true,
                        onConfirm: (val) => updateActiveImage({ rotationDeg: val }),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">∠:</span>
                    <span>{activeImage.rotationDeg.toFixed(1)}°</span>
                  </button>
                </div>

                {/* Seletor de Método de Calibração */}
                <div className="border-t border-[#293444]/60 pt-1.5">
                  <span className="block text-[9px] font-bold uppercase text-[#94A3B8] mb-1">
                    Método de Calibração 1:1
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: "two_points" as const, label: "2 Pontos (Régua)" },
                        { id: "multi_ref" as const, label: "Múltiplas Cotas" },
                        { id: "scanner_dpi" as const, label: "Scanner (DPI)" },
                        { id: "homography_4pt" as const, label: "Homografia 4 Pts" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateActiveImage({ calibrationMode: m.id })}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[9.5px] font-bold border transition-all cursor-pointer",
                          activeImage.calibrationMode === m.id
                            ? "border-[#E11D48] bg-[#E11D48]/20 text-[#FB7185]"
                            : isDark
                              ? "border-[#293444] bg-[#0D121B] text-[#94A3B8]"
                              : "border-[#CBD5E1] bg-[#FFFFFF] text-[#64748B]",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Painel específico: 2 Pontos ou Múltiplas Referências */}
                {(activeImage.calibrationMode === "two_points" ||
                  activeImage.calibrationMode === "multi_ref") && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9.5px] text-[#94A3B8]">Distância Real (mm):</span>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Medida Real de Referência (mm)",
                            currentValue: calKnownMm,
                            unit: "mm",
                            onConfirm: (val) => setCalKnownMm(Math.max(0.1, val)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span>{calKnownMm.toFixed(2)} mm</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9.5px] text-[#94A3B8]">Alinhamento:</span>
                      <div className="flex gap-1">
                        {(["free", "horizontal", "vertical"] as const).map((ax) => (
                          <button
                            key={ax}
                            type="button"
                            onClick={() => setCalAxisHint(ax)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase border cursor-pointer",
                              calAxisHint === ax
                                ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                                : "border-[#293444] text-[#94A3B8]",
                            )}
                          >
                            {ax === "free" ? "Livre" : ax === "horizontal" ? "Horiz" : "Vert"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const targetMode: RevEngCanvasInteractionMode =
                            activeImage.calibrationMode === "two_points"
                              ? "pick_cal_2pt"
                              : "pick_cal_multiref";
                          if (canvasInteractionMode === targetMode) {
                            onSetCanvasInteractionMode("none");
                          } else {
                            onClearPendingPickPoints();
                            onSetCanvasInteractionMode(targetMode);
                            toast.info("Toque nos 2 pontos de referência sobre a imagem no canvas.");
                          }
                        }}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold cursor-pointer border",
                          canvasInteractionMode === "pick_cal_2pt" ||
                            canvasInteractionMode === "pick_cal_multiref"
                            ? "border-amber-400 bg-amber-500/20 text-amber-300 animate-pulse"
                            : "border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8]",
                        )}
                      >
                        <Crosshair className="size-3.5" />
                        <span>
                          {canvasInteractionMode === "pick_cal_2pt" ||
                          canvasInteractionMode === "pick_cal_multiref"
                            ? `Marcando (${pendingPickPointsWorld.length}/2 pts)`
                            : "Marcar 2 Pts no Canvas"}
                        </span>
                      </button>

                      {activeImage.calibrationMode === "two_points" ? (
                        <button
                          type="button"
                          disabled={pendingPickPointsWorld.length < 2}
                          onClick={handleApplyTwoPointCalibration}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-[10px] font-bold cursor-pointer",
                            pendingPickPointsWorld.length >= 2
                              ? "bg-emerald-600 text-white hover:bg-emerald-500"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed",
                          )}
                        >
                          Calibrar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pendingPickPointsWorld.length < 2}
                          onClick={handleAddMultiReferenceLine}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-[10px] font-bold cursor-pointer",
                            pendingPickPointsWorld.length >= 2
                              ? "bg-emerald-600 text-white hover:bg-emerald-500"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed",
                          )}
                        >
                          + Cota
                        </button>
                      )}
                    </div>

                    {/* Tabela de Resíduos de Múltiplas Referências */}
                    {activeImage.calibrationMode === "multi_ref" && multiRefEvaluation && (
                      <div className="mt-1 rounded-lg border border-[#293444] bg-[#0D121B] p-1.5 text-[9px]">
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span>
                            RMS: {multiRefEvaluation.rmsErrorMm.toFixed(3)} mm · Máx:{" "}
                            {multiRefEvaluation.maxErrorMm.toFixed(3)} mm
                          </span>
                          <span
                            className={cn(
                              "px-1 py-0.2 rounded uppercase",
                              multiRefEvaluation.status === "ok"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : multiRefEvaluation.status === "incompativel"
                                  ? "bg-rose-500/20 text-rose-400"
                                  : "bg-amber-500/20 text-amber-400",
                            )}
                          >
                            {multiRefEvaluation.status}
                          </span>
                        </div>
                        <div className="space-y-0.5 max-h-28 overflow-y-auto">
                          {multiRefEvaluation.residuals.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center justify-between border-t border-[#293444]/40 pt-0.5"
                            >
                              <span className="truncate max-w-[85px]">{r.label}</span>
                              <span>{r.knownLengthMm.toFixed(1)} mm</span>
                              <span
                                className={cn(
                                  "font-bold",
                                  r.compatible ? "text-emerald-400" : "text-rose-400",
                                )}
                              >
                                {r.errorMm >= 0 ? "+" : ""}
                                {r.errorMm.toFixed(2)} mm
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateActiveImage({ references: [] })}
                          className="mt-1 w-full rounded border border-[#293444] py-0.5 text-[8.5px] text-[#94A3B8] hover:text-white"
                        >
                          Limpar referências ({activeImage.references.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Painel específico: Scanner DPI */}
                {activeImage.calibrationMode === "scanner_dpi" && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] text-[#94A3B8]">Resolução Scanner (DPI):</span>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Resolução do Scanner (DPI)",
                            currentValue: scannerDpiInput,
                            unit: "mm",
                            onConfirm: (val) => setScannerDpiInput(Math.max(72, Math.round(val))),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span>{scannerDpiInput} DPI</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] text-[#94A3B8]">Cota de Conferência:</span>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Cota Física de Conferência (mm)",
                            currentValue: scannerCheckMm,
                            unit: "mm",
                            onConfirm: (val) => setScannerCheckMm(Math.max(1, val)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span>{scannerCheckMm.toFixed(2)} mm</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyScannerDpi}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 text-[10px] font-bold cursor-pointer"
                    >
                      Aplicar Escala {scannerDpiInput} DPI (1:1)
                    </button>
                  </div>
                )}

                {/* Painel específico: Homografia 4 Pontos */}
                {activeImage.calibrationMode === "homography_4pt" && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Largura do Quadro Real (mm)",
                            currentValue: homogWidthMm,
                            unit: "mm",
                            onConfirm: (val) => setHomogWidthMm(Math.max(1, val)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Larg:</span>
                        <span>{homogWidthMm.toFixed(1)} mm</span>
                      </button>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Altura do Quadro Real (mm)",
                            currentValue: homogHeightMm,
                            unit: "mm",
                            onConfirm: (val) => setHomogHeightMm(Math.max(1, val)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Alt:</span>
                        <span>{homogHeightMm.toFixed(1)} mm</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (canvasInteractionMode === "pick_homography_4pt") {
                            onSetCanvasInteractionMode("none");
                          } else {
                            onClearPendingPickPoints();
                            onSetCanvasInteractionMode("pick_homography_4pt");
                            toast.info("Toque nos 4 cantos do retângulo conhecido no canvas (C1 → C4).");
                          }
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold cursor-pointer",
                          canvasInteractionMode === "pick_homography_4pt"
                            ? "border-amber-400 bg-amber-500/20 text-amber-300 animate-pulse"
                            : "border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8]",
                        )}
                      >
                        {canvasInteractionMode === "pick_homography_4pt"
                          ? `Cantos (${pendingPickPointsWorld.length}/4)`
                          : "Marcar 4 Cantos"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingPickPointsWorld.length < 4}
                        onClick={handleApplyHomography4Pt}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-[10px] font-bold cursor-pointer",
                          pendingPickPointsWorld.length >= 4
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed",
                        )}
                      >
                        Retificar
                      </button>
                    </div>
                    {activeImage.homography && (
                      <div className="rounded bg-emerald-950/50 border border-emerald-500/40 px-2 py-1 text-[9px] text-emerald-300">
                        Retificado {activeImage.homography.realWidthMm} ×{" "}
                        {activeImage.homography.realHeightMm} mm · Erro RMS:{" "}
                        {activeImage.homography.residualRmsMm.toFixed(3)} mm
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIA 2: CADERNO DE MEDIÇÕES DE BANCADA                         */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => handleToggleCategory("caderno")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Ruler className="size-3.5 text-[#38BDF8]" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              2. Caderno de Medições
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#94A3B8]">
              {syncedMeasurements.length} cotas
            </span>
            {revEng.activeCategory === "caderno" ? (
              <ChevronDown className="size-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="size-3.5 text-[#94A3B8]" />
            )}
          </div>
        </button>

        {revEng.activeCategory === "caderno" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/60 pt-2">
            {/* Formulário compacto de nova medida com Teclado Numérico */}
            <div className="grid grid-cols-2 gap-1">
              <select
                value={newMeasKind}
                onChange={(e) => setNewMeasKind(e.target.value as MeasurementKind)}
                className={cn(
                  "rounded-lg border px-1.5 py-1 text-[9.5px] font-bold outline-none",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                {Object.entries(MEASUREMENT_KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>

              <select
                value={newMeasInstrument}
                onChange={(e) => {
                  const inst = e.target.value as MeasurementInstrument;
                  setNewMeasInstrument(inst);
                  setNewMeasUncertainty(MEASUREMENT_INSTRUMENT_META[inst].defaultUncertaintyMm);
                }}
                className={cn(
                  "rounded-lg border px-1.5 py-1 text-[9.5px] font-bold outline-none",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                {Object.entries(MEASUREMENT_INSTRUMENT_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: `${MEASUREMENT_KIND_LABELS[newMeasKind].label}`,
                    currentValue: newMeasValue,
                    unit: MEASUREMENT_KIND_LABELS[newMeasKind].defaultUnit,
                    onConfirm: (val) => setNewMeasValue(Math.max(0.01, val)),
                  })
                }
                className={numBtnClass}
              >
                <span className="text-[8.5px] text-[#94A3B8]">Valor:</span>
                <span>
                  {newMeasValue.toFixed(2)} {MEASUREMENT_KIND_LABELS[newMeasKind].defaultUnit}
                </span>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Incerteza do Instrumento (±)",
                    currentValue: newMeasUncertainty,
                    unit: MEASUREMENT_KIND_LABELS[newMeasKind].defaultUnit,
                    onConfirm: (val) => setNewMeasUncertainty(Math.max(0.005, val)),
                  })
                }
                className={numBtnClass}
              >
                <span className="text-[8.5px] text-[#94A3B8]">Inc ±:</span>
                <span>±{newMeasUncertainty.toFixed(2)}</span>
              </button>
            </div>

            {/* Seletor de Estado da Informação (MEDIDO / CALCULADO / ESTIMADO / HIPÓTESE / DESCONHECIDO) */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] text-[#94A3B8]">Estado:</span>
              <select
                value={newMeasStatus}
                onChange={(e) => setNewMeasStatus(e.target.value as RevEngInfoStatus)}
                className={cn(
                  "flex-1 rounded-lg border px-1.5 py-1 text-[9.5px] font-bold outline-none",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                {Object.entries(REV_ENG_STATUS_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.shortLabel} — {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddMeasurement}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white py-1.5 text-[10px] font-bold shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>
                Registrar Medida{" "}
                {selection.length === 1 ? "(Vincular à Seleção)" : "no Caderno"}
              </span>
            </button>

            {/* Lista de Medições Registradas e Comparação Medido × Nominal Desenhado */}
            {syncedMeasurements.length === 0 ? (
              <p className="text-[9.5px] text-[#94A3B8] text-center py-2">
                Nenhuma medida registrada. Meça com paquímetro/trena e adicione acima.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                {syncedMeasurements.map((m) => {
                  const statusMeta = REV_ENG_STATUS_META[m.infoStatus];
                  const hasDiscrepancy =
                    typeof m.discrepancyMm === "number" &&
                    m.discrepancyMm > m.uncertaintyMmOrDeg;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-lg border p-1.5 text-[9.5px] flex flex-col gap-1",
                        hasDiscrepancy
                          ? "border-amber-500/60 bg-amber-950/25"
                          : isDark
                            ? "border-[#293444] bg-[#151C27]/80"
                            : "border-[#CBD5E1] bg-[#FFFFFF]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-bold text-[#38BDF8]">{m.code}</span>
                          <span className="truncate font-semibold">{m.label}</span>
                        </div>
                        <span
                          className={cn(
                            "rounded border px-1 py-0.2 text-[8px] font-bold uppercase shrink-0",
                            isDark
                              ? `${statusMeta.badgeBgDark} ${statusMeta.badgeTextDark} ${statusMeta.badgeBorderDark}`
                              : `${statusMeta.badgeBgLight} ${statusMeta.badgeTextLight} ${statusMeta.badgeBorderLight}`,
                          )}
                        >
                          {statusMeta.shortLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[9px]">
                        <span>
                          Medido:{" "}
                          <strong className="text-emerald-400">
                            {m.valueMmOrDeg.toFixed(2)} {m.unit}
                          </strong>{" "}
                          (±{m.uncertaintyMmOrDeg.toFixed(2)})
                        </span>
                        {typeof m.drawnNominalValue === "number" && (
                          <span
                            className={cn(
                              "font-bold",
                              hasDiscrepancy ? "text-amber-400" : "text-slate-400",
                            )}
                          >
                            CAD: {m.drawnNominalValue.toFixed(2)} (Δ{" "}
                            {m.discrepancyMm?.toFixed(2)} {m.unit})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-[#293444]/40">
                        <div className="flex items-center gap-1">
                          {selection.length === 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const selId = selection[0]!;
                                onChangeRevEng((prev) => ({
                                  ...prev,
                                  measurements: prev.measurements.map((x) =>
                                    x.id === m.id
                                      ? {
                                          ...x,
                                          linkedEntityId:
                                            x.linkedEntityId === selId ? undefined : selId,
                                        }
                                      : x,
                                  ),
                                }));
                              }}
                              className="inline-flex items-center gap-0.5 rounded border border-[#293444] px-1.5 py-0.5 text-[8.5px] text-[#94A3B8] hover:text-white cursor-pointer"
                              title="Vincular ou desvincular da entidade selecionada"
                            >
                              {m.linkedEntityId === selection[0] ? (
                                <>
                                  <Unlink className="size-2.5" /> Desvincular
                                </>
                              ) : (
                                <>
                                  <Link2 className="size-2.5" /> Vincular Sel
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleApplyMeasurementToEntity(m)}
                            className="rounded bg-[#38BDF8]/15 border border-[#38BDF8]/40 px-1.5 py-0.5 text-[8.5px] font-bold text-[#38BDF8] hover:bg-[#38BDF8]/25 cursor-pointer"
                            title="Aplicar esta medida diretamente na entidade vinculada ou selecionada"
                          >
                            Aplicar no CAD
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onChangeRevEng((prev) => ({
                              ...prev,
                              measurements: prev.measurements.filter((x) => x.id !== m.id),
                            }))
                          }
                          className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
                          title="Excluir medição"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIA 3: CAPTURA DE CONTORNO E AJUSTES ORTOGONAIS (T10)         */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => handleToggleCategory("contorno_ajuste")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Compass className="size-3.5 text-emerald-400" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              3. Contorno e Ajustes (LSQ)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#94A3B8]">
              {revEng.capturedPoints.length} pts
            </span>
            {revEng.activeCategory === "contorno_ajuste" ? (
              <ChevronDown className="size-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="size-3.5 text-[#94A3B8]" />
            )}
          </div>
        </button>

        {revEng.activeCategory === "contorno_ajuste" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/60 pt-2">
            {/* Botão de ativar captura de pontos no canvas com Lupa 3× */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (canvasInteractionMode === "capture_contour_pts") {
                    onSetCanvasInteractionMode("none");
                  } else {
                    onSetCanvasInteractionMode("capture_contour_pts");
                    toast.info(
                      "Modo Captura de Contorno ativo: toque sobre a borda da peça no canvas para coletar pontos.",
                    );
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-[10px] font-bold cursor-pointer transition-all",
                  canvasInteractionMode === "capture_contour_pts"
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-xs animate-pulse"
                    : "border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8] hover:bg-[#38BDF8]/25",
                )}
              >
                <Crosshair className="size-3.5" />
                <span>
                  {canvasInteractionMode === "capture_contour_pts"
                    ? `Capturando no Canvas (${revEng.capturedPoints.length} pts)`
                    : "Capturar Pontos no Canvas"}
                </span>
              </button>

              {revEng.capturedPoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeRevEng((prev) => ({
                      ...prev,
                      capturedPoints: prev.capturedPoints.slice(0, -1),
                    }));
                    onSetFittedPreviewCandidate(null);
                  }}
                  className="rounded-lg border border-[#293444] bg-[#151C27] px-2 py-1.5 text-[9.5px] text-[#94A3B8] hover:text-white cursor-pointer"
                  title="Desfazer último ponto capturado"
                >
                  -1 Pt
                </button>
              )}

              {revEng.capturedPoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeRevEng((prev) => ({ ...prev, capturedPoints: [] }));
                    onSetFittedPreviewCandidate(null);
                  }}
                  className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2 py-1.5 text-[9.5px] text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                  title="Limpar todos os pontos capturados"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Configuração de Tolerância RDP e Contorno Fechado */}
            <div className="flex items-center justify-between gap-2 text-[9.5px]">
              <div className="flex items-center gap-1">
                <span className="text-[#94A3B8]">Tol. RDP:</span>
                <button
                  type="button"
                  onClick={(ev) =>
                    openKeypad(ev, {
                      label: "Tolerância de Simplificação RDP (mm)",
                      currentValue: revEng.rdpToleranceMm,
                      unit: "mm",
                      onConfirm: (val) =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          rdpToleranceMm: Math.max(0.01, val),
                        })),
                    })
                  }
                  className={numBtnClass}
                >
                  <span>{revEng.rdpToleranceMm.toFixed(2)} mm</span>
                </button>
              </div>

              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fitClosedContour}
                  onChange={(e) => setFitClosedContour(e.target.checked)}
                  className="accent-[#E11D48]"
                />
                <span>Fechar</span>
              </label>
            </div>

            {/* Botões de Ajuste Ortogonal de Primitivas (Reta, Círculo, Arco, Polilinha RDP, Spline) */}
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => handleRunGeometricFit("line")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#38BDF8]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                <Minus className="size-3.5 text-[#38BDF8]" />
                <span>Ajustar Reta</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunGeometricFit("arc")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#38BDF8]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                <Compass className="size-3.5 text-emerald-400" />
                <span>Ajustar Arco</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunGeometricFit("circle")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#38BDF8]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                <CircleDot className="size-3.5 text-amber-400" />
                <span>Ajustar Círculo</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunGeometricFit("polyline_rdp")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#38BDF8]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                <PenLine className="size-3.5 text-purple-400" />
                <span>Polilinha RDP</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleRunGeometricFit("spline")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9.5px] font-bold cursor-pointer",
                isDark
                  ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#38BDF8]"
                  : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
              )}
            >
              <Sparkles className="size-3.5 text-cyan-400" />
              <span>Ajustar Spline Controlada (Suave)</span>
            </button>

            {/* Card de Diagnóstico do Ajuste Ortogonal (RMS, Desvio Máx, Nº de Pontos) */}
            {fittedPreviewCandidate && (
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-2 text-[9.5px] flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-bold text-emerald-300">
                  <span>{fittedPreviewCandidate.summaryLabel}</span>
                  <span className="rounded bg-indigo-500/30 px-1.5 py-0.2 text-[8px] text-indigo-200">
                    AJUSTADO
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#0D121B]/80 p-1.5 text-center">
                  <div>
                    <div className="text-[8px] text-[#94A3B8]">RMS</div>
                    <div className="font-bold text-[#38BDF8]">
                      {fittedPreviewCandidate.rmsMm.toFixed(3)} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#94A3B8]">Desvio Máx</div>
                    <div className="font-bold text-amber-300">
                      {fittedPreviewCandidate.maxDeviationMm.toFixed(3)} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#94A3B8]">Amostras</div>
                    <div className="font-bold text-white">
                      {fittedPreviewCandidate.pointsUsed} pts
                    </div>
                  </div>
                </div>

                {fittedPreviewCandidate.collinearWarning && (
                  <div className="flex items-start gap-1 rounded bg-amber-950/60 border border-amber-500/40 p-1.5 text-[8.5px] text-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
                    <span>{fittedPreviewCandidate.collinearWarning}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-1">
                  <select
                    value={fitTargetLayer}
                    onChange={(e) => setFitTargetLayer(e.target.value)}
                    className="rounded border border-[#293444] bg-[#0D121B] px-1.5 py-1 text-[9px] text-[#E6EDF5]"
                  >
                    <option value="corte">Camada: Corte</option>
                    <option value="recorte">Camada: Recorte</option>
                    <option value="marcacao">Camada: Marcação</option>
                    <option value="referencia">Camada: Referência</option>
                  </select>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetFittedPreviewCandidate(null)}
                      className="rounded-lg border border-[#293444] bg-[#0D121B] px-2 py-1 text-[9px] text-[#94A3B8] hover:text-white cursor-pointer"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitFittedCandidate}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-[9.5px] font-bold shadow-xs cursor-pointer"
                    >
                      <Check className="size-3" />
                      <span>Inserir no CAD</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Extras da Categoria 3 (Fase D): Intenção de Projeto, Pente de Raios e Detector PCD */}
            <ChamferRevEngCategory3Extras
              revEng={revEng}
              onChangeRevEng={onChangeRevEng}
              entities={entities}
              selection={selection}
              setSelection={setSelection}
              commit={(nextEnts) => commit(nextEnts)}
              activeLayer={activeLayer}
              onSetFittedPreviewCandidate={onSetFittedPreviewCandidate}
              openKeypad={openKeypad}
              isDark={isDark}
            />
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIAS 4 E 5: BANCADA DE FUROS, TRILATERAÇÃO, REDE E PONTES TTR */}
      {/* =================================================================== */}
      <ChamferRevEngBenchPanels
        revEng={revEng}
        onChangeRevEng={onChangeRevEng}
        entities={entities}
        selection={selection}
        setSelection={setSelection}
        commit={commit}
        activeLayer={activeLayer}
        onSetFittedPreviewCandidate={onSetFittedPreviewCandidate}
        openKeypad={openKeypad}
        onToggleCategory={handleToggleCategory}
        isDark={isDark}
      />

      {/* =================================================================== */}
      {/* CATEGORIAS 6 E 7: AUTO-POCKET 2D, CREMALHEIRA E ENGRENAGEM ISO 54   */}
      {/* =================================================================== */}
      <ChamferRevEngContourPocketPanels
        revEng={revEng}
        onChangeRevEng={onChangeRevEng}
        entities={entities}
        selection={selection}
        setSelection={setSelection}
        commit={(nextEnts) => commit(nextEnts)}
        activeLayer={activeLayer}
        onSetFittedPreviewCandidate={onSetFittedPreviewCandidate}
        openKeypad={openKeypad}
        onToggleCategory={handleToggleCategory}
        isDark={isDark}
      />

      {/* =================================================================== */}
      {/* CATEGORIA 8: VISTAS, MAPA 2.5D, CORTE A-A, RESTRIÇÕES E STL (FASE E) */}
      {/* =================================================================== */}
      <ChamferRevEng25DPanel
        revEng={revEng}
        onChangeRevEng={(updater) => {
          onChangeRevEng((prev) => {
            const next = updater(prev);
            if (
              typeof next.baseThicknessMm === "number" &&
              next.baseThicknessStatus !== "DESCONHECIDO" &&
              next.baseThicknessMm !== thickness
            ) {
              onThicknessChange(next.baseThicknessMm);
            }
            return next;
          });
        }}
        entities={entities}
        selection={selection}
        syncedMeasurements={syncedMeasurements}
        commit={(nextEnts) => commit(nextEnts)}
        activeLayer={activeLayer as LayerId}
        openKeypad={openKeypad}
        onToggleCategory={handleToggleCategory}
        isDark={isDark}
      />

      {/* TECLADO NUMÉRICO CUSTOMIZADO DO CHAMFER (SEM TECLADO NATIVO DO CELULAR) */}
      {keypadReq && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => setKeypadReq(null)}
          screenPos={keypadReq.screenPos}
          currentValue={keypadReq.currentValue}
          label={keypadReq.label}
          unit={keypadReq.unit}
          allowNegative={keypadReq.allowNegative}
          onConfirm={(val) => {
            keypadReq.onConfirm(val);
            setKeypadReq(null);
          }}
        />
      )}
    </div>
  );
}
