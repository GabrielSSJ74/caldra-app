import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Compass,
  Copy,
  DollarSign,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Layers,
  Package,
  PackageCheck,
  Pencil,
  Play,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  addPart,
  createProject,
  deleteProject,
  derivedStatus,
  duplicateProject,
  markDelivered,
  PART_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  projectProgress,
  removePart,
  renameProject,
  setPartStatus,
  updatePart,
  updateProject,
  useProjects,
  type PartStatus,
  type Project,
  type ProjectPart,
  type ProjectStatus,
} from "@/lib/projects/store";
import { formatDateTime, partTarget } from "@/lib/projects/links";
import { openPartInChamfer } from "@/lib/projects/chamfer";
import { newProject as newLabProject, saveProject as saveLabProject } from "@/lib/lab2d/projects";
import { useMaterials } from "@/lib/materials/MaterialsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { CaldraIntegratedWorkshopModal } from "@/components/lab2d/CaldraIntegratedWorkshopModal";
import { MaterialManager } from "@/components/chameleon/MaterialManager";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { AddPartDialog } from "@/components/projects/AddPartDialog";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { Planificacao } from "./planificacao";
import { Oficina } from "./oficina";
import {
  calculateBendCompensation,
  calculateIndustrialCosts,
  createImmutableQuoteSnapshot,
  evaluateDependencyStates,
  INDUSTRIAL_STAGES,
  SHOP_FLOOR_STEPS,
  type DependencySyncState,
  type EmittedQuoteSnapshot,
  type IndustrialStageId,
  type ShopFloorStepId,
  type WorkOrderDependencyRecord,
} from "@/lib/production/pcpEngine";
import { cn } from "@/lib/utils";

export type ProduzirDestId = "painel" | "trabalhos" | "engenharia" | "custos" | "oficina";
export type EngenhariaSubId = "central_pcp" | "nesting" | "dobra_k" | "materiais";
export type TrabalhoDetailTabId =
  | "resumo"
  | "pecas"
  | "engenharia_pcp"
  | "materiais"
  | "nesting_corte"
  | "custos_orcamento"
  | "producao_qr"
  | "documentos";
export type OficinaSubId = "bancada" | "ficha_qr" | "etapas";

export const Route = createFileRoute("/produzir")({
  head: () => ({
    meta: [
      { title: "Produzir · Engenharia de Operações, PCP & Oficina — CALDRA" },
      {
        name: "description",
        content:
          "Centro integrado de Engenharia de Operações, PCP, Nesting CNC, Custos, Orçamentos e Chão de Fábrica.",
      },
      { property: "og:title", content: "Produzir · PCP & Chão de Fábrica — CALDRA" },
      {
        property: "og:description",
        content:
          "Gerencie ordens de serviço, peças, materiais, aproveitamento de chapas, custos de máquina e inspeção QR.",
      },
    ],
  }),
  component: ProduzirCommandCenter,
});

const fmtBRL = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const WORK_STAGE_STORAGE_KEY = "caldra.pcp.work_stages.v1";
const SHOP_STEP_STORAGE_KEY = "caldra.pcp.shop_steps.v1";
const QUOTES_STORAGE_KEY = "caldra.pcp.emitted_quotes.v1";
const DEPS_STORAGE_KEY = "caldra.pcp.dependencies.v1";

function loadJsonMap<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonMap<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage quota errors */
  }
}

function defaultIndustrialStageForProject(p: Project): IndustrialStageId {
  const st = derivedStatus(p);
  if (st === "entregue" || p.delivered) return "conclusao";
  if (st === "concluido") return "inspecao";
  if (st === "em-producao" || p.status === "em-producao") return "producao";
  const pct = projectProgress(p);
  if (pct >= 70) return "producao";
  if (pct >= 45) return "planejamento_pcp";
  return "desenvolvimento_tecnico";
}

function defaultShopStepForProject(p: Project): ShopFloorStepId {
  const st = derivedStatus(p);
  if (st === "entregue" || p.delivered) return "concluido";
  if (st === "concluido") return "inspecao_dimensional";
  const pct = projectProgress(p);
  if (pct >= 65) return "soldagem";
  if (pct >= 35) return "corte_cnc";
  return "preparacao";
}

function DependencyBadge({ state }: { state: DependencySyncState }) {
  if (state === "atualizado") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> Atualizado
      </span>
    );
  }
  if (state === "pendente_revisao") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase text-amber-600 dark:text-amber-400">
        <AlertTriangle className="size-3" /> Pendente de revisão
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase text-rose-600 dark:text-rose-400">
      <RefreshCw className="size-3" /> Desatualizado
    </span>
  );
}

export function ProduzirPage() {
  return <ProduzirCommandCenter />;
}

export function ProduzirCommandCenter() {
  const navigate = useNavigate();
  const projects = useProjects();
  const materialsCtx = useMaterials();
  const { requirePro, projectLimit } = useFeatureAccess();

  // 1. Navegação Principal dos 5 Destinos
  const [activeDest, setActiveDest] = useState<ProduzirDestId>("painel");
  const [engSub, setEngSub] = useState<EngenhariaSubId>("central_pcp");
  const [workDetailTab, setWorkDetailTab] = useState<TrabalhoDetailTabId>("resumo");
  const [oficinaSub, setOficinaSub] = useState<OficinaSubId>("bancada");

  // 2. Trabalho Ativo Contextual vs. Modo Peça Avulsa
  const [activeWorkId, setActiveWorkId] = useState<string | null>(() => projects[0]?.id ?? null);
  const [userDetachedWork, setUserDetachedWork] = useState(false);
  const [workSwitcherOpen, setWorkSwitcherOpen] = useState(false);

  useEffect(() => {
    if (activeWorkId && !projects.some((p) => p.id === activeWorkId)) {
      setActiveWorkId(projects[0]?.id ?? null);
    } else if (!activeWorkId && !userDetachedWork && projects.length > 0) {
      setActiveWorkId(projects[0]?.id ?? null);
    }
  }, [projects, activeWorkId, userDetachedWork]);

  const activeWork = useMemo(
    () => (activeWorkId ? projects.find((p) => p.id === activeWorkId) ?? null : null),
    [projects, activeWorkId],
  );

  // 3. Busca contextual e filtros do Painel/Trabalhos
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "todos" | "desenvolvimento" | "orcamento" | "producao" | "inspecao" | "concluidos"
  >("todos");

  // Modais de criação/edição de Trabalho e Peça
  const [creatingWork, setCreatingWork] = useState(false);
  const [addingPartWorkId, setAddingPartWorkId] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<{ workId: string; part: ProjectPart } | null>(
    null,
  );
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [qrScanInput, setQrScanInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // 4. Ciclo de Vida Industrial (9 Etapas) + Chão de Fábrica (8 Etapas) + Dependências
  const [workStages, setWorkStages] = useState<Record<string, IndustrialStageId>>(() =>
    loadJsonMap(WORK_STAGE_STORAGE_KEY, {}),
  );
  const [shopSteps, setShopSteps] = useState<Record<string, ShopFloorStepId>>(() =>
    loadJsonMap(SHOP_STEP_STORAGE_KEY, {}),
  );
  const [emittedQuotes, setEmittedQuotes] = useState<EmittedQuoteSnapshot[]>(() =>
    loadJsonMap(QUOTES_STORAGE_KEY, []),
  );
  const [depRecords, setDepRecords] = useState<Record<string, WorkOrderDependencyRecord>>(() =>
    loadJsonMap(DEPS_STORAGE_KEY, {}),
  );

  const getWorkStage = (p: Project): IndustrialStageId =>
    workStages[p.id] ?? defaultIndustrialStageForProject(p);

  const setWorkStageFor = (projectId: string, stage: IndustrialStageId) => {
    setWorkStages((prev) => {
      const next = { ...prev, [projectId]: stage };
      saveJsonMap(WORK_STAGE_STORAGE_KEY, next);
      return next;
    });
  };

  const getShopStep = (p: Project): ShopFloorStepId =>
    shopSteps[p.id] ?? defaultShopStepForProject(p);

  const setShopStepFor = (projectId: string, step: ShopFloorStepId) => {
    setShopSteps((prev) => {
      const next = { ...prev, [projectId]: step };
      saveJsonMap(SHOP_STEP_STORAGE_KEY, next);
      return next;
    });
    if (step === "concluido") {
      setWorkStageFor(projectId, "conclusao");
      markDelivered(projectId, true);
    } else if (step === "inspecao_dimensional") {
      setWorkStageFor(projectId, "inspecao");
    } else {
      setWorkStageFor(projectId, "producao");
    }
  };

  const getDepRecord = (workId: string): WorkOrderDependencyRecord =>
    depRecords[workId] ?? {
      workOrderId: workId,
      lastGeometryChangeAt: 1000,
      lastNestingValidatedAt: 1000,
      lastBomValidatedAt: 1000,
      lastCostValidatedAt: 1000,
    };

  const markGeometryChanged = (workId: string) => {
    const now = Date.now();
    setDepRecords((prev) => {
      const cur = prev[workId] ?? getDepRecord(workId);
      const next = {
        ...prev,
        [workId]: { ...cur, lastGeometryChangeAt: now },
      };
      saveJsonMap(DEPS_STORAGE_KEY, next);
      return next;
    });
  };

  const markNestingAndBomValidated = (workId: string) => {
    const now = Date.now();
    setDepRecords((prev) => {
      const cur = prev[workId] ?? getDepRecord(workId);
      const next = {
        ...prev,
        [workId]: {
          ...cur,
          lastNestingValidatedAt: now,
          lastBomValidatedAt: now,
        },
      };
      saveJsonMap(DEPS_STORAGE_KEY, next);
      return next;
    });
  };

  const markCostsValidated = (workId: string) => {
    const now = Date.now();
    setDepRecords((prev) => {
      const cur = prev[workId] ?? getDepRecord(workId);
      const next = {
        ...prev,
        [workId]: {
          ...cur,
          lastNestingValidatedAt: Math.max(cur.lastNestingValidatedAt, now),
          lastBomValidatedAt: Math.max(cur.lastBomValidatedAt, now),
          lastCostValidatedAt: now,
        },
      };
      saveJsonMap(DEPS_STORAGE_KEY, next);
      return next;
    });
  };

  const activeDeps = useMemo(
    () =>
      activeWork
        ? evaluateDependencyStates(getDepRecord(activeWork.id))
        : { nesting: "atualizado" as const, bom: "atualizado" as const, costs: "atualizado" as const },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWork, depRecords],
  );

  // 5. Estado de Compensação de Dobra (Fator K)
  const [bendFlange1, setBendFlange1] = useState(60);
  const [bendFlange2, setBendFlange2] = useState(140);
  const [bendFlange3, setBendFlange3] = useState(60);
  const [bendAngle1, setBendAngle1] = useState(90);
  const [bendAngle2, setBendAngle2] = useState(90);
  const [bendThickness, setBendThickness] = useState(3);
  const [bendRadius, setBendRadius] = useState(3);
  const [bendKFactor, setBendKFactor] = useState(0.4);

  const bendResult = useMemo(
    () =>
      calculateBendCompensation({
        flangeLengthsMm: [bendFlange1, bendFlange2, bendFlange3],
        bendAnglesDeg: [bendAngle1, bendAngle2],
        thicknessMm: bendThickness,
        insideRadiusMm: bendRadius,
        kFactor: bendKFactor,
      }),
    [bendFlange1, bendFlange2, bendFlange3, bendAngle1, bendAngle2, bendThickness, bendRadius, bendKFactor],
  );

  // 6. Estado de Custos & Orçamento Comercial (4 Blocos)
  const defaultMat = materialsCtx.visible[0] ?? {
    id: "builtin:aco-carbono",
    name: "Aço Carbono SAE 1020",
    density: 7850,
    pricePerKg: 9.5,
  };
  const [costMassKg, setCostMassKg] = useState(75.35);
  const [costPricePerKg, setCostPricePerKg] = useState(defaultMat.pricePerKg || 9.5);
  const [costCutMeters, setCostCutMeters] = useState(25.2);
  const [costCncRatePerM, setCostCncRatePerM] = useState(8.5);
  const [costPierces, setCostPierces] = useState(16);
  const [costPerPierce, setCostPerPierce] = useState(1.5);
  const [costBends, setCostBends] = useState(12);
  const [costPerBend, setCostPerBend] = useState(4.5);
  const [costCalenderingHours, setCostCalenderingHours] = useState(1.5);
  const [costCalenderingRate, setCostCalenderingRate] = useState(110);
  const [costWeldMeters, setCostWeldMeters] = useState(6.5);
  const [costWeldRatePerM, setCostWeldRatePerM] = useState(28);
  const [costMachiningHours, setCostMachiningHours] = useState(2);
  const [costMachiningRate, setCostMachiningRate] = useState(95);
  const [costPaintingM2, setCostPaintingM2] = useState(4.2);
  const [costPaintingRate, setCostPaintingRate] = useState(45);
  const [costLaborHours, setCostLaborHours] = useState(8);
  const [costLaborRate, setCostLaborRate] = useState(85);
  const [costConsumablesBRL, setCostConsumablesBRL] = useState(95);
  const [costFreightBRL, setCostFreightBRL] = useState(220);
  const [costTaxPct, setCostTaxPct] = useState(12);
  const [costMarginBdiPct, setCostMarginBdiPct] = useState(28);
  const [approvedCommercialOverride, setApprovedCommercialOverride] = useState<string>("");

  const costBreakdown = useMemo(
    () =>
      calculateIndustrialCosts({
        netMassKg: costMassKg,
        pricePerKgBRL: costPricePerKg,
        lossPct: materialsCtx.lossPct,
        cutLengthMeters: costCutMeters,
        cncCutRatePerMeterBRL: costCncRatePerM,
        pierceCount: costPierces,
        costPerPierceBRL: costPerPierce,
        bendCount: costBends,
        costPerBendBRL: costPerBend,
        calenderingHours: costCalenderingHours,
        calenderingRateBRL: costCalenderingRate,
        weldingMeters: costWeldMeters,
        weldingRatePerMeterBRL: costWeldRatePerM,
        machiningFinishingHours: costMachiningHours,
        machiningRateBRL: costMachiningRate,
        paintingAreaM2: costPaintingM2,
        paintingRatePerM2BRL: costPaintingRate,
        directLaborHours: costLaborHours,
        directLaborRateBRL: costLaborRate,
        consumablesBRL: costConsumablesBRL,
        freightAndInstallationBRL: costFreightBRL,
        overheadTaxPct: costTaxPct,
        profitMarginBdiPct: costMarginBdiPct,
        approvedCommercialPriceBRL:
          approvedCommercialOverride.trim() !== ""
            ? Number(approvedCommercialOverride.replace(",", "."))
            : null,
      }),
    [
      costMassKg,
      costPricePerKg,
      materialsCtx.lossPct,
      costCutMeters,
      costCncRatePerM,
      costPierces,
      costPerPierce,
      costBends,
      costPerBend,
      costCalenderingHours,
      costCalenderingRate,
      costWeldMeters,
      costWeldRatePerM,
      costMachiningHours,
      costMachiningRate,
      costPaintingM2,
      costPaintingRate,
      costLaborHours,
      costLaborRate,
      costConsumablesBRL,
      costFreightBRL,
      costTaxPct,
      costMarginBdiPct,
      approvedCommercialOverride,
    ],
  );

  // Gera QR Code real para o Trabalho Ativo
  useEffect(() => {
    const targetWork = activeWork ?? projects[0];
    if (!targetWork) return;
    const payload = JSON.stringify({
      sys: "CALDRA-PCP",
      os: targetWork.code ?? "OS-001",
      id: targetWork.id,
      name: targetWork.name,
      client: targetWork.client,
      rev: targetWork.revision,
      stage: getWorkStage(targetWork),
    });
    QRCode.toDataURL(payload, { width: 180, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork, projects, workStages]);

  // 7. KPIs Reais e Seleção do Trabalho Prioritário (Sem Duplicação!)
  const kpis = useMemo(() => {
    let emDesenvolvimento = 0;
    let aguardandoOrcamento = 0;
    let emProducao = 0;
    let concluidos = 0;

    for (const p of projects) {
      const stage = getWorkStage(p);
      if (stage === "conclusao" || derivedStatus(p) === "entregue") {
        concluidos++;
      } else if (stage === "orcamento" || stage === "aprovacao") {
        aguardandoOrcamento++;
      } else if (stage === "preparacao" || stage === "producao" || stage === "inspecao") {
        emProducao++;
      } else {
        emDesenvolvimento++;
      }
    }
    return { emDesenvolvimento, aguardandoOrcamento, emProducao, concluidos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, workStages]);

  const priorityWork = useMemo(() => {
    if (activeWork) return activeWork;
    const inProd = projects.find((p) => derivedStatus(p) !== "entregue");
    return inProd ?? projects[0] ?? null;
  }, [activeWork, projects]);

  const filteredWorks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (q) {
        const hit = [p.name, p.client, p.code ?? "", p.description].some((f) =>
          f.toLowerCase().includes(q),
        );
        if (!hit) return false;
      }
      const stage = getWorkStage(p);
      if (statusFilter === "desenvolvimento") {
        return (
          stage === "cadastro" ||
          stage === "desenvolvimento_tecnico" ||
          stage === "planejamento_pcp"
        );
      }
      if (statusFilter === "orcamento") {
        return stage === "orcamento" || stage === "aprovacao";
      }
      if (statusFilter === "producao") {
        return stage === "preparacao" || stage === "producao";
      }
      if (statusFilter === "inspecao") {
        return stage === "inspecao";
      }
      if (statusFilter === "concluidos") {
        return stage === "conclusao" || derivedStatus(p) === "entregue";
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, searchQuery, statusFilter, workStages]);

  // No Painel, a lista "Outros Trabalhos Ativos" NUNCA duplica o Trabalho Prioritário exibido no Hero Card!
  const otherWorksForPanel = useMemo(() => {
    if (!priorityWork) return filteredWorks;
    const withoutPriority = filteredWorks.filter((p) => p.id !== priorityWork.id);
    return withoutPriority;
  }, [filteredWorks, priorityWork]);

  const handleStartNewWork = () => {
    if (projects.length >= projectLimit) {
      requirePro("projects.unlimited");
      return;
    }
    setCreatingWork(true);
  };

  const handleResumeStage = (work: Project) => {
    setActiveWorkId(work.id);
    const stageId = getWorkStage(work);
    const meta = INDUSTRIAL_STAGES.find((s) => s.id === stageId) ?? INDUSTRIAL_STAGES[1]!;
    setActiveDest(meta.targetDestination);
    if (meta.targetDestination === "engenharia" && meta.targetSubTab) {
      setEngSub(meta.targetSubTab as EngenhariaSubId);
    } else if (meta.targetDestination === "oficina" && meta.targetSubTab) {
      setOficinaSub(meta.targetSubTab as OficinaSubId);
    } else if (meta.targetDestination === "trabalhos" && meta.targetSubTab) {
      setWorkDetailTab(meta.targetSubTab as TrabalhoDetailTabId);
    }
    toast.success(`Retomando "${work.name}" em ${meta.shortLabel}`);
  };

  const handleOpenPartInCadOrParametric = (work: Project, part: ProjectPart) => {
    if (part.catalogPart) {
      const labId = openPartInChamfer(work, part);
      navigate({ to: "/desenho-2d/$projectId", params: { projectId: labId } });
      return;
    }
    const target = partTarget(part.modelId);
    if (!target) {
      toast.error("Modelo desta peça não está disponível.");
      return;
    }
    if (target.kind === "parametric") {
      navigate({
        to: "/tracagem/$slug",
        params: { slug: target.slug },
        search: { projeto: work.id, peca: part.instanceId },
      });
    } else {
      navigate({
        to: "/tracagem/cnc/$id",
        params: { id: target.id },
        search: { projeto: work.id, peca: part.instanceId },
      });
    }
  };

  const handleEmitImmutableProposal = () => {
    const target = activeWork ?? projects[0];
    const code = target?.code ?? "OS-AVULSA";
    const name = target?.name ?? "Serviço Técnico Avulso";
    const client = target?.client || "Cliente Industrial";
    const revNum = target ? target.revision : emittedQuotes.length + 1;

    const snapshot = createImmutableQuoteSnapshot({
      workOrderId: target?.id ?? "standalone",
      workOrderCode: code,
      workOrderName: name,
      clientName: client,
      revisionNumber: revNum,
      breakdown: costBreakdown,
      netMassKg: costMassKg,
      notes: `Matéria-prima (${materialsCtx.lossPct}% perda) + Corte/Dobra/Solda + BDI ${costMarginBdiPct}%`,
    });

    setEmittedQuotes((prev) => {
      const next = [snapshot, ...prev];
      saveJsonMap(QUOTES_STORAGE_KEY, next);
      return next;
    });

    if (target) {
      markCostsValidated(target.id);
      updateProject(target.id, { revision: target.revision + 1 });
      setWorkStageFor(target.id, "aprovacao");
    }

    toast.success(
      `Proposta ${snapshot.id} (${snapshot.revisionLabel}) emitida e congelada no histórico!`,
    );
  };

  const handleQrScanLookup = () => {
    const q = qrScanInput.trim().toLowerCase();
    if (!q) {
      toast.error("Digite ou selecione o código da Ordem de Serviço / QR.");
      return;
    }
    const found = projects.find(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        p.name.toLowerCase().includes(q),
    );
    if (found) {
      setActiveWorkId(found.id);
      setQrScanOpen(false);
      setQrScanInput("");
      setActiveDest("oficina");
      setOficinaSub("ficha_qr");
      toast.success(`OS localizada: ${found.name} (${found.code ?? found.id})`);
    } else {
      toast.error("Nenhuma Ordem de Serviço encontrada para este código QR.");
    }
  };

  return (
    <div className="relative min-h-screen space-y-3.5 pt-14 sm:pt-4 pb-[calc(140px+env(safe-area-inset-bottom))]">
      {/* =================================================================== */}
      {/* 1. CABEÇALHO COMPACTO E HIERÁRQUICO ("PRODUZIR")                    */}
      {/* =================================================================== */}
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-emerald-600 dark:text-emerald-400">
              ● ENGENHARIA DE OPERAÇÕES &amp; CHÃO DE FÁBRICA
            </span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
              CALDRA PCP
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Produzir
          </h1>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Buscar trabalho, OS, cliente ou peça"
              className={cn(
                "grid size-9 place-items-center rounded-xl border transition-colors",
                searchOpen
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-card/80 text-muted-foreground hover:text-foreground",
              )}
            >
              <Search className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setQrScanOpen(true)}
              aria-label="Ler código QR de Ordem de Serviço"
              className="grid size-9 place-items-center rounded-xl border border-line bg-card/80 text-muted-foreground hover:border-accent hover:text-accent transition-colors"
              title="Ler / Localizar Ficha QR"
            >
              <QrCode className="size-4" />
            </button>

            <button
              type="button"
              onClick={handleStartNewWork}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 font-mono text-[11px] font-bold uppercase text-background shadow-sm hover:opacity-90 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              <span>Novo Trabalho</span>
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome do trabalho, código OS, cliente ou peça..."
              className="w-full rounded-xl border border-line bg-card/90 py-2 pr-9 pl-9 text-xs text-foreground outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpar busca"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </header>

      {/* =================================================================== */}
      {/* 2. BARRA SEGMENTADA DE 5 DESTINOS (ZERO SCROLL HORIZONTAL EM 320PX) */}
      {/* =================================================================== */}
      <nav
        aria-label="Navegação principal de Operações e Produção"
        className="sticky top-[68px] z-30 rounded-2xl border border-line bg-card/95 p-1 shadow-md backdrop-blur-xl"
      >
        <div className="grid grid-cols-5 gap-1">
          {(
            [
              { id: "painel", label: "Painel", icon: Activity },
              { id: "trabalhos", label: "Trabalhos", icon: FolderKanban },
              { id: "engenharia", label: "Engenharia", icon: Compass },
              { id: "custos", label: "Custos", icon: DollarSign },
              { id: "oficina", label: "Oficina", icon: Wrench },
            ] as const
          ).map((tab) => {
            const active = activeDest === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDest(tab.id)}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl px-1 py-1.5 sm:py-2 font-mono text-[9.5px] sm:text-[11px] font-bold tracking-tight uppercase transition-all whitespace-nowrap min-w-0",
                  active
                    ? "bg-accent text-background shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <tab.icon className="size-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* =================================================================== */}
      {/* 3. BARRA PERSISTENTE DE CONTEXTO DO TRABALHO ATIVO                  */}
      {/* =================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/75 px-3 py-2 text-xs">
        {activeWork ? (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase text-accent">
              Trabalho Ativo:
            </span>
            <strong className="font-display text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              {activeWork.name}
            </strong>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-foreground">
              {activeWork.client || "Cliente Padrão"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
              {activeWork.code ?? "OS-001"} · Rev. {activeWork.revision}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
              Modo Peça Avulsa / Simulação Rápida
            </span>
            <span className="text-[11px] text-muted-foreground">
              Cálculos desacoplados de Ordem de Serviço específica.
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setWorkSwitcherOpen((v) => !v)}
            className="rounded-lg border border-line bg-background/70 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-foreground hover:border-accent transition-colors whitespace-nowrap"
          >
            ⇄ Trocar Trabalho
          </button>
          {activeWork && (
            <button
              type="button"
              onClick={() => {
                setUserDetachedWork(true);
                setActiveWorkId(null);
                toast.info("Modo Peça Avulsa ativado.");
              }}
              className="rounded-lg border border-line bg-background/70 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              × Peça Avulsa
            </button>
          )}
        </div>
      </div>

      {/* Seletor rápido de troca de Trabalho Ativo */}
      {workSwitcherOpen && (
        <Panel className="p-3 space-y-2 border-accent/40">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase text-accent">
              Selecionar Trabalho Ativo (Ordem de Serviço)
            </span>
            <button
              type="button"
              onClick={() => setWorkSwitcherOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setUserDetachedWork(false);
                  setActiveWorkId(p.id);
                  setWorkSwitcherOpen(false);
                  toast.success(`Trabalho ativo alterado para "${p.name}".`);
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-2.5 text-left transition-colors",
                  activeWorkId === p.id
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-line bg-background/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="min-w-0">
                  <p className="font-display text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                    {p.name}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    {p.code ?? "OS"} · {p.client || "Sem cliente"} · {p.parts.length} peça(s)
                  </p>
                </div>
                <span className="font-mono text-[10px] font-bold tabular-nums text-accent">
                  {projectProgress(p)}%
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* =================================================================== */}
      {/* DESTINO 1: PAINEL OPERACIONAL (📊)                                  */}
      {/* =================================================================== */}
      {activeDest === "painel" && (
        <div className="space-y-4">
          {/* 4 KPIs Reais do Ciclo de Produção */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "desenvolvimento" ? "todos" : "desenvolvimento")
              }
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                statusFilter === "desenvolvimento"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-card/85 hover:border-accent/40",
              )}
            >
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Em Desenvolvimento
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                {kpis.emDesenvolvimento}
              </p>
              <span className="text-[11px] text-muted-foreground">Engenharia &amp; PCP</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "orcamento" ? "todos" : "orcamento")
              }
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                statusFilter === "orcamento"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-card/85 hover:border-accent/40",
              )}
            >
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Aguardando Orçamento
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {kpis.aguardandoOrcamento}
              </p>
              <span className="text-[11px] text-muted-foreground">Custos &amp; Aprovação</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "producao" ? "todos" : "producao")
              }
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                statusFilter === "producao"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-card/85 hover:border-accent/40",
              )}
            >
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Em Produção
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-accent">
                {kpis.emProducao}
              </p>
              <span className="text-[11px] text-muted-foreground">Corte, Dobra &amp; Solda</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "concluidos" ? "todos" : "concluidos")
              }
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                statusFilter === "concluidos"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-card/85 hover:border-accent/40",
              )}
            >
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Concluídos
              </span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {kpis.concluidos}
              </p>
              <span className="text-[11px] text-muted-foreground">Inspecionados &amp; Entregues</span>
            </button>
          </div>

          {/* CARD HERO: TRABALHO PRIORITÁRIO EM EXECUÇÃO (CONTRASTE CORRIGIDO!) */}
          {priorityWork && (() => {
            const stageId = getWorkStage(priorityWork);
            const stageMeta =
              INDUSTRIAL_STAGES.find((s) => s.id === stageId) ?? INDUSTRIAL_STAGES[1]!;
            const pct = projectProgress(priorityWork);
            return (
              <div
                data-testid="priority-work-hero"
                className="rounded-2xl border border-accent/40 bg-card/95 p-4 shadow-sm space-y-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                      <span className="font-bold uppercase tracking-wider text-accent">
                        Trabalho Prioritário em Execução
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-semibold text-foreground">
                        {priorityWork.code ?? "OS-001"}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">Rev. {priorityWork.revision}</span>
                    </div>

                    {/* Título com contraste estrito #0F172A no Claro e #F8FAFC no Escuro */}
                    <h2 className="font-display text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {priorityWork.name}
                    </h2>

                    <p className="text-xs text-muted-foreground">
                      Cliente:{" "}
                      <strong className="font-medium text-foreground">
                        {priorityWork.client || "Cliente Industrial"}
                      </strong>{" "}
                      · {priorityWork.parts.length} peça(s) cadastrada(s) · Atualizado em{" "}
                      {formatDateTime(priorityWork.updatedAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-xl font-bold tabular-nums text-accent">
                      {pct}%
                    </span>
                    <span className="block font-mono text-[9.5px] uppercase text-muted-foreground">
                      Progresso Geral
                    </span>
                  </div>
                </div>

                {/* Subcard de Etapa Adaptável ao Tema (fim da caixa cinza chumbo #4B5563 no modo Claro!) */}
                <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-100/85 dark:bg-slate-900/70 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-bold uppercase text-[#0F172A] dark:text-[#F8FAFC]">
                      Etapa Atual: {stageMeta.label}
                    </span>
                    <span className="font-mono text-[10px] text-accent font-semibold">
                      Próxima ação recomendada
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {stageMeta.description}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.max(8, pct)}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResumeStage(priorityWork)}
                    className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase text-background shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap"
                  >
                    <Play className="size-3.5 fill-current" />
                    Retomar Etapa ({stageMeta.shortLabel})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkId(priorityWork.id);
                      setActiveDest("trabalhos");
                      setWorkDetailTab("resumo");
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-background/70 px-3.5 py-2.5 font-mono text-xs font-semibold uppercase text-foreground hover:border-accent transition-colors whitespace-nowrap"
                  >
                    <FolderKanban className="size-3.5 text-accent" />
                    Ver Detalhes
                  </button>
                </div>
              </div>
            );
          })()}

          {/* LISTA DE OUTROS TRABALHOS ATIVOS (SEM DUPLICAR O TRABALHO PRIORITÁRIO!) */}
          <Panel className="p-4 space-y-3" data-testid="other-active-works-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  Demais Ordens de Serviço &amp; Trabalhos na Fila
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Exibindo trabalhos complementares ao prioritário em destaque acima.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-background/50 p-1">
                {(
                  [
                    { id: "todos", label: "Todos" },
                    { id: "desenvolvimento", label: "Desenvolvimento" },
                    { id: "orcamento", label: "Orçamento" },
                    { id: "producao", label: "Produção" },
                    { id: "inspecao", label: "Inspeção" },
                    { id: "concluidos", label: "Concluídos" },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusFilter(chip.id)}
                    className={cn(
                      "rounded-lg px-2 py-1 font-mono text-[9.5px] font-semibold uppercase transition-colors whitespace-nowrap",
                      statusFilter === chip.id
                        ? "bg-accent text-background font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {otherWorksForPanel.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-5 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Nenhum outro trabalho neste filtro além do trabalho prioritário em destaque.
                </p>
                <button
                  type="button"
                  onClick={handleStartNewWork}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-accent"
                >
                  <Plus className="size-3.5" /> Cadastrar Nova Ordem de Serviço
                </button>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {otherWorksForPanel.map((work) => {
                  const stageMeta =
                    INDUSTRIAL_STAGES.find((s) => s.id === getWorkStage(work)) ??
                    INDUSTRIAL_STAGES[0]!;
                  const pct = projectProgress(work);
                  return (
                    <div
                      key={work.id}
                      className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-background/50 p-3 hover:border-accent/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-[9.5px] uppercase text-muted-foreground">
                            {work.code ?? "OS"} · {stageMeta.shortLabel}
                          </span>
                          <h4 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                            {work.name}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {work.client || "Cliente Industrial"} · {work.parts.length} peça(s)
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold tabular-nums text-accent">
                          {pct}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/60">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveWorkId(work.id);
                            setActiveDest("trabalhos");
                          }}
                          className="font-mono text-[10px] font-semibold uppercase text-foreground hover:text-accent"
                        >
                          Abrir Dossiê →
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResumeStage(work)}
                          className="rounded-lg bg-accent/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-accent hover:bg-accent/25"
                        >
                          Ativar &amp; Retomar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* GRADE DE AÇÕES RÁPIDAS DE OFICINA */}
          <Panel className="p-4 space-y-3">
            <SectionLabel>Ações Rápidas de Engenharia &amp; Oficina</SectionLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[
                {
                  label: "+ Novo Trabalho",
                  sub: "Abrir OS",
                  icon: Plus,
                  onClick: handleStartNewWork,
                },
                {
                  label: "Importar CHAMFER",
                  sub: "Geometria CAD",
                  icon: Compass,
                  onClick: () => {
                    setActiveDest("engenharia");
                    setEngSub("central_pcp");
                  },
                },
                {
                  label: "Nesting de Chapa",
                  sub: "Corte & Kerf",
                  icon: Layers,
                  onClick: () => {
                    setActiveDest("engenharia");
                    setEngSub("nesting");
                  },
                },
                {
                  label: "Materiais & Ligas",
                  sub: "5 Ligas NBR",
                  icon: Boxes,
                  onClick: () => {
                    setActiveDest("engenharia");
                    setEngSub("materiais");
                  },
                },
                {
                  label: "Simular Orçamento",
                  sub: "Custos & BDI",
                  icon: DollarSign,
                  onClick: () => setActiveDest("custos"),
                },
                {
                  label: "Bancada & Lote",
                  sub: "Peças do Lote",
                  icon: Wrench,
                  onClick: () => {
                    setActiveDest("oficina");
                    setOficinaSub("bancada");
                  },
                },
                {
                  label: "Ler / Emitir QR",
                  sub: "Inspeção & Rastreio",
                  icon: QrCode,
                  onClick: () => {
                    setActiveDest("oficina");
                    setOficinaSub("ficha_qr");
                  },
                },
              ].map((act) => (
                <button
                  key={act.label}
                  type="button"
                  onClick={act.onClick}
                  className="flex flex-col items-start justify-between gap-1.5 rounded-xl border border-line bg-background/50 p-2.5 text-left hover:border-accent transition-colors"
                >
                  <act.icon className="size-4 text-accent" />
                  <div>
                    <p className="font-display text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {act.label}
                    </p>
                    <p className="font-mono text-[9.5px] text-muted-foreground">{act.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* =================================================================== */}
      {/* DESTINO 2: TRABALHOS / ORDENS DE SERVIÇO & DOSSIÊ DE 8 ABAS (📋)    */}
      {/* =================================================================== */}
      {activeDest === "trabalhos" && (
        <div className="space-y-4">
          {/* Carrossel / Seletor de Trabalhos Cadastrados */}
          <Panel className="p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Ordens de Serviço &amp; Dossiês ({projects.length})</SectionLabel>
              <button
                type="button"
                onClick={handleStartNewWork}
                className="flex items-center gap-1 rounded-xl bg-accent/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-accent"
              >
                <Plus className="size-3.5" /> Novo Trabalho
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredWorks.map((p) => {
                const isSelected = activeWork?.id === p.id;
                const stageMeta =
                  INDUSTRIAL_STAGES.find((s) => s.id === getWorkStage(p)) ?? INDUSTRIAL_STAGES[0]!;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveWorkId(p.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      isSelected
                        ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                        : "border-line bg-background/50 hover:border-accent/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] text-muted-foreground">
                      <span>
                        {p.code ?? "OS"} · Rev. {p.revision}
                      </span>
                      <span className="font-bold text-accent">{projectProgress(p)}%</span>
                    </div>
                    <p className="mt-0.5 font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.client || "Cliente Industrial"} · {p.parts.length} peça(s) ·{" "}
                      {stageMeta.shortLabel}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Detalhe Multi-Aba do Trabalho Selecionado */}
          {activeWork && (() => {
            const currentStageId = getWorkStage(activeWork);
            const currentStageMeta =
              INDUSTRIAL_STAGES.find((s) => s.id === currentStageId) ?? INDUSTRIAL_STAGES[0]!;
            return (
              <Panel className="p-4 space-y-4">
                {/* Cabeçalho do Dossiê do Trabalho */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="font-bold text-accent">{activeWork.code ?? "OS-001"}</span>
                      <span>·</span>
                      <span>Revisão {activeWork.revision}</span>
                      <span>·</span>
                      <span>{PROJECT_STATUS_LABEL[derivedStatus(activeWork)]}</span>
                    </div>
                    <h2 className="mt-0.5 font-display text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {activeWork.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Cliente: <strong className="text-foreground">{activeWork.client || "—"}</strong>{" "}
                      {activeWork.description ? `· ${activeWork.description}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddingPartWorkId(activeWork.id)}
                      className="flex items-center gap-1 rounded-xl bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-background"
                    >
                      <Plus className="size-3.5" /> Adicionar Peça
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const copy = duplicateProject(activeWork.id);
                        if (copy) {
                          setActiveWorkId(copy.id);
                          toast.success("Ordem de serviço duplicada!");
                        }
                      }}
                      className="rounded-xl border border-line bg-background/60 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase text-foreground hover:border-accent"
                    >
                      Duplicar OS
                    </button>
                  </div>
                </div>

                {/* Stepper Flexível das 9 Etapas Industriais */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase text-muted-foreground">
                      Fluxo Industrial Flexível (9 Etapas — toque para avançar ou pular etapas não aplicáveis)
                    </span>
                    <span className="font-mono text-[10px] font-bold text-accent">
                      {currentStageMeta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-9">
                    {INDUSTRIAL_STAGES.map((st) => {
                      const isCurrent = st.id === currentStageId;
                      const isDone = st.order < currentStageMeta.order;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            setWorkStageFor(activeWork.id, st.id);
                            toast.success(`Etapa do trabalho atualizada para: ${st.label}`);
                          }}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-left font-mono text-[9px] transition-all",
                            isCurrent
                              ? "border-accent bg-accent text-background font-bold"
                              : isDone
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                                : "border-line bg-background/40 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="block truncate">
                            {st.order}. {st.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Indicadores de Sincronização de Dependências */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-background/50 px-3 py-2 text-xs">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    Rastreabilidade Relacional do Dossiê:
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px]">
                      Nesting: <DependencyBadge state={activeDeps.nesting} />
                    </span>
                    <span className="flex items-center gap-1 text-[11px]">
                      BOM: <DependencyBadge state={activeDeps.bom} />
                    </span>
                    <span className="flex items-center gap-1 text-[11px]">
                      Custos: <DependencyBadge state={activeDeps.costs} />
                    </span>
                  </div>
                </div>

                {/* Barra das 8 Sub-Abas do Dossiê */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line pb-2">
                  {(
                    [
                      { id: "resumo", label: "Resumo" },
                      { id: "pecas", label: `Peças (${activeWork.parts.length})` },
                      { id: "engenharia_pcp", label: "Engenharia & PCP" },
                      { id: "materiais", label: "Materiais" },
                      { id: "nesting_corte", label: "Nesting / Corte" },
                      { id: "custos_orcamento", label: "Custos & Orçamento" },
                      { id: "producao_qr", label: "Produção & QR" },
                      { id: "documentos", label: "Documentos & Revisões" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWorkDetailTab(t.id)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 font-mono text-[10px] font-bold uppercase transition-colors whitespace-nowrap shrink-0",
                        workDetailTab === t.id
                          ? "bg-accent text-background"
                          : "border border-line bg-background/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Conteúdo da Sub-Aba 1: Resumo */}
                {workDetailTab === "resumo" && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-line bg-background/40 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Código / OS &amp; Revisão
                      </span>
                      <p className="font-mono text-sm font-bold text-foreground">
                        {activeWork.code ?? "OS-001"} · Rev. {activeWork.revision}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-background/40 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Cliente / Destino
                      </span>
                      <p className="font-display text-sm font-bold text-foreground">
                        {activeWork.client || "Cliente Industrial"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-background/40 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Total de Peças &amp; Itens
                      </span>
                      <p className="font-mono text-sm font-bold tabular-nums text-accent">
                        {activeWork.parts.length} tipos ·{" "}
                        {activeWork.parts.reduce((acc, x) => acc + x.quantity, 0)} un totais
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-background/40 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Etapa Atual
                      </span>
                      <p className="font-display text-sm font-bold text-foreground">
                        {currentStageMeta.shortLabel}
                      </p>
                    </div>
                  </div>
                )}

                {/* Conteúdo da Sub-Aba 2: Peças */}
                {workDetailTab === "pecas" && (
                  <div className="space-y-2.5">
                    {activeWork.parts.map((part) => (
                      <div
                        key={part.instanceId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-background/40 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                              {part.name}
                            </p>
                            <span className="font-mono text-[10px] text-accent">
                              {PART_STATUS_LABEL[part.status]}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            Qtd: {part.quantity} un · Material: {part.material} · Espessura:{" "}
                            {part.thickness} mm · Rev. {part.revision ?? 1}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingPart({ workId: activeWork.id, part })}
                            className="rounded-lg border border-line bg-card px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-foreground hover:border-accent"
                          >
                            Editar Parâmetros
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPartInCadOrParametric(activeWork, part)}
                            className="rounded-lg bg-accent/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-accent"
                          >
                            Abrir Geometria
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sub-Abas de Atalho Relacional */}
                {workDetailTab === "engenharia_pcp" && (
                  <div className="rounded-xl border border-line bg-background/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-display text-sm font-bold text-foreground">
                        Central de Engenharia &amp; PCP vinculada a {activeWork.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Abra a bancada paramétrica Costa Ferro, Dossiê ABNT, Corte 6m e BOM.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDest("engenharia");
                        setEngSub("central_pcp");
                      }}
                      className="rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      Ir para Central de Engenharia &amp; PCP →
                    </button>
                  </div>
                )}

                {workDetailTab === "materiais" && (
                  <div className="rounded-xl border border-line bg-background/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-display text-sm font-bold text-foreground">
                        Materiais &amp; Ligas do Trabalho
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Perda padrão configurada: {materialsCtx.lossPct}% ·{" "}
                        {materialsCtx.visible.length} ligas disponíveis.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDest("engenharia");
                        setEngSub("materiais");
                      }}
                      className="rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      Gerenciar Materiais &amp; Ligas →
                    </button>
                  </div>
                )}

                {workDetailTab === "nesting_corte" && (
                  <div className="rounded-xl border border-line bg-background/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-sm font-bold text-foreground">
                          Plano de Nesting &amp; Corte de Chapa CNC
                        </h4>
                        <DependencyBadge state={activeDeps.nesting} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Valide o arranjo de chapas e alimente a BOM e os Custos deste trabalho.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDest("engenharia");
                        setEngSub("nesting");
                      }}
                      className="rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      Abrir Nesting CNC →
                    </button>
                  </div>
                )}

                {workDetailTab === "custos_orcamento" && (
                  <div className="rounded-xl border border-line bg-background/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-sm font-bold text-foreground">
                          Custos de Máquina &amp; Orçamento Comercial
                        </h4>
                        <DependencyBadge state={activeDeps.costs} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Preço Técnico Sugerido atual: {fmtBRL(costBreakdown.suggestedTechnicalPriceBRL)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDest("custos")}
                      className="rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      Abrir Custos &amp; Proposta →
                    </button>
                  </div>
                )}

                {workDetailTab === "producao_qr" && (
                  <div className="rounded-xl border border-line bg-background/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-display text-sm font-bold text-foreground">
                        Rastreamento de Chão de Fábrica &amp; Ficha QR
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Etapa de oficina atual:{" "}
                        {SHOP_FLOOR_STEPS.find((s) => s.id === getShopStep(activeWork))?.label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDest("oficina");
                        setOficinaSub("ficha_qr");
                      }}
                      className="rounded-xl bg-accent px-4 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      Abrir Ficha &amp; QR →
                    </button>
                  </div>
                )}

                {workDetailTab === "documentos" && (
                  <div className="space-y-2.5">
                    <h4 className="font-mono text-[10px] font-bold uppercase text-muted-foreground">
                      Histórico Imutável de Propostas &amp; Revisões Emitidas
                    </h4>
                    {emittedQuotes.filter((q) => q.workOrderId === activeWork.id).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma proposta congelada emitida ainda para esta OS. Emita na aba Custos.
                      </p>
                    ) : (
                      emittedQuotes
                        .filter((q) => q.workOrderId === activeWork.id)
                        .map((qt) => (
                          <div
                            key={qt.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-background/50 p-3 text-xs"
                          >
                            <div>
                              <span className="font-mono text-[10px] font-bold text-accent">
                                {qt.id} · {qt.revisionLabel} · IMUTÁVEL
                              </span>
                              <p className="font-medium text-foreground">{qt.notes}</p>
                            </div>
                            <strong className="font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                              {fmtBRL(qt.approvedCommercialPriceBRL)}
                            </strong>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </Panel>
            );
          })()}
        </div>
      )}

      {/* =================================================================== */}
      {/* DESTINO 3: ENGENHARIA (4 SUB-SEGMENTOS EM PÍLULAS) (🏗️)             */}
      {/* =================================================================== */}
      {activeDest === "engenharia" && (
        <div className="space-y-4">
          {/* Sub-navegação de 4 Segmentos de Engenharia */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 rounded-2xl border border-line bg-card/85 p-1.5">
            {(
              [
                { id: "central_pcp", label: "Central de Engenharia & PCP" },
                { id: "nesting", label: "Nesting de Chapa CNC" },
                { id: "dobra_k", label: "Planificação & Dobra (Fator K)" },
                { id: "materiais", label: "Materiais & Ligas" },
              ] as const
            ).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setEngSub(sub.id)}
                className={cn(
                  "rounded-xl px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-tight transition-all text-center",
                  engSub === sub.id
                    ? "bg-accent text-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* 3.1 Central de Engenharia & PCP */}
          {engSub === "central_pcp" && (
            <CaldraIntegratedWorkshopModal
              open={true}
              onClose={() => {}}
              embedded={true}
              projectName={activeWork?.name}
              onInsertEntitiesToCad={(entities) => {
                const proj = newLabProject(
                  activeWork?.name ?? `Estrutura PCP ${new Date().toLocaleDateString("pt-BR")}`,
                  entities,
                );
                saveLabProject(proj);
                navigate({ to: "/desenho-2d/$projectId", params: { projectId: proj.id } });
              }}
            />
          )}

          {/* 3.2 Nesting & Aproveitamento de Chapa CNC */}
          {engSub === "nesting" && (
            <Planificacao
              embedded={true}
              onValidateNesting={(summary) => {
                setCostMassKg(summary.totalMassKg);
                if (activeWork) {
                  markNestingAndBomValidated(activeWork.id);
                }
                toast.success(
                  `Nesting validado (${summary.perSheet} un/chapa · ${summary.yieldPct}% aproveitamento · ${summary.totalMassKg} kg) e sincronizado com BOM e Custos!`,
                );
              }}
            />
          )}

          {/* 3.3 Desenvolvimento, Planificação & Compensação de Dobra (Fator K) */}
          {engSub === "dobra_k" && (
            <Panel className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Desenvolvimento Plano &amp; Compensação de Dobra (Fator K)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cálculo de linha neutra, Avanço de Dobra (BA), Dedução de Dobra (BD), Matriz V recomendada e Blank 1:1.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (activeWork) {
                      markGeometryChanged(activeWork.id);
                    }
                    toast.success(
                      `Desenvolvimento plano (${bendResult.flatPatternLengthMm} mm) aplicado à engenharia do trabalho!`,
                    );
                  }}
                  className="rounded-xl bg-accent px-3.5 py-2 font-mono text-[10px] font-bold uppercase text-background"
                >
                  ✓ Aplicar Desenvolvimento ao Trabalho Ativo
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-12">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:col-span-7">
                  <NumBox label="Aba 1 (mm)" value={bendFlange1} onChange={setBendFlange1} />
                  <NumBox label="Base Central (mm)" value={bendFlange2} onChange={setBendFlange2} />
                  <NumBox label="Aba 2 (mm)" value={bendFlange3} onChange={setBendFlange3} />
                  <NumBox label="Ângulo Dobra 1 (°)" value={bendAngle1} onChange={setBendAngle1} />
                  <NumBox label="Ângulo Dobra 2 (°)" value={bendAngle2} onChange={setBendAngle2} />
                  <NumBox
                    label="Espessura Chapa (mm)"
                    value={bendThickness}
                    onChange={setBendThickness}
                    step={0.5}
                  />
                  <NumBox
                    label="Raio Interno Ri (mm)"
                    value={bendRadius}
                    onChange={setBendRadius}
                    step={0.5}
                  />
                  <NumBox
                    label="Fator K (Linha Neutra)"
                    value={bendKFactor}
                    onChange={setBendKFactor}
                    step={0.02}
                  />
                </div>

                <div className="space-y-2.5 lg:col-span-5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line bg-background/50 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Soma Externa das Abas
                      </span>
                      <p className="font-mono text-base font-bold tabular-nums text-foreground">
                        {bendResult.totalSumOfFlangesMm} mm
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-background/50 p-3">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        Dedução Total (BD)
                      </span>
                      <p className="font-mono text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        − {bendResult.totalBendDeductionMm} mm
                      </p>
                    </div>
                    <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 col-span-2">
                      <span className="font-mono text-[9.5px] font-bold uppercase text-accent">
                        Comprimento Desenvolvido Plano (Blank CNC)
                      </span>
                      <p className="font-mono text-xl font-bold tabular-nums text-accent">
                        {bendResult.flatPatternLengthMm} mm
                      </p>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Matriz V recomendada: V = {bendResult.recommendedVDieMm} mm · Eixo neutro:{" "}
                        {bendResult.neutralAxisOffsetMm} mm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* 3.4 Materiais & Ligas */}
          {engSub === "materiais" && <MaterialManager />}
        </div>
      )}

      {/* =================================================================== */}
      {/* DESTINO 4: CUSTOS & ORÇAMENTO COMERCIAL (4 BLOCOS CLAROS) (💲)      */}
      {/* =================================================================== */}
      {activeDest === "custos" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-12">
            {/* BLOCO 1 & BLOCO 2: CUSTO DIRETO + CUSTOS ADICIONAIS/INDIRETOS */}
            <div className="space-y-4 lg:col-span-7">
              <Panel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>1. Custo Direto (Matéria-Prima, Máquina &amp; Mão de Obra)</SectionLabel>
                  <span className="font-mono text-xs font-bold tabular-nums text-accent">
                    {fmtBRL(costBreakdown.totalDirectCostBRL)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Fórmula auditada: Massa Líquida ({costMassKg} kg) × Preço/kg (R$ {costPricePerKg}) × (1 + Perda{" "}
                  {materialsCtx.lossPct}%) = <strong>{fmtBRL(costBreakdown.rawMaterialCostBRL)}</strong>
                </p>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <NumBox label="Massa Líquida (kg)" value={costMassKg} onChange={setCostMassKg} step={0.5} />
                  <NumBox
                    label="Preço Aço/Liga (R$/kg)"
                    value={costPricePerKg}
                    onChange={setCostPricePerKg}
                    step={0.5}
                  />
                  <NumBox
                    label="Corte CNC (m)"
                    value={costCutMeters}
                    onChange={setCostCutMeters}
                    step={0.5}
                  />
                  <NumBox
                    label="Taxa Corte (R$/m)"
                    value={costCncRatePerM}
                    onChange={setCostCncRatePerM}
                    step={0.5}
                  />
                  <NumBox label="Dobras CNC (un)" value={costBends} onChange={setCostBends} />
                  <NumBox label="Custo/Dobra (R$)" value={costPerBend} onChange={setCostPerBend} step={0.5} />
                  <NumBox
                    label="Calandragem (h)"
                    value={costCalenderingHours}
                    onChange={setCostCalenderingHours}
                    step={0.5}
                  />
                  <NumBox
                    label="Soldagem MIG/TIG (m)"
                    value={costWeldMeters}
                    onChange={setCostWeldMeters}
                    step={0.5}
                  />
                  <NumBox
                    label="Mão de Obra Direta (h)"
                    value={costLaborHours}
                    onChange={setCostLaborHours}
                    step={0.5}
                  />
                </div>
              </Panel>

              <Panel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>2. Custos Adicionais &amp; Indiretos + 3. Margem &amp; BDI</SectionLabel>
                  <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                    {fmtBRL(costBreakdown.additionalAndIndirectCostBRL)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <NumBox
                    label="Consumíveis (R$)"
                    value={costConsumablesBRL}
                    onChange={setCostConsumablesBRL}
                  />
                  <NumBox
                    label="Frete & Instalação (R$)"
                    value={costFreightBRL}
                    onChange={setCostFreightBRL}
                  />
                  <NumBox
                    label="Impostos / Indiretos (%)"
                    value={costTaxPct}
                    onChange={setCostTaxPct}
                  />
                  <NumBox
                    label="Margem & BDI (%)"
                    value={costMarginBdiPct}
                    onChange={setCostMarginBdiPct}
                  />
                </div>
              </Panel>
            </div>

            {/* BLOCO 4: PREÇO TÉCNICO SUGERIDO VS. ORÇAMENTO COMERCIAL APROVADO */}
            <div className="space-y-4 lg:col-span-5">
              <Panel className="p-4 space-y-3.5 border-accent/40">
                <SectionLabel>4. Formação de Preço &amp; Emissão de Proposta</SectionLabel>

                <div className="space-y-1.5 text-xs">
                  <CostRow
                    label={`Matéria-Prima Bruta (${costBreakdown.grossMassWithLossKg} kg c/ perda)`}
                    val={fmtBRL(costBreakdown.rawMaterialCostBRL)}
                  />
                  <CostRow
                    label="Corte CNC + Furação (Pierces)"
                    val={fmtBRL(costBreakdown.cncCuttingCostBRL)}
                  />
                  <CostRow
                    label="Dobra CNC + Calandragem"
                    val={fmtBRL(costBreakdown.bendingCostBRL + costBreakdown.calenderingCostBRL)}
                  />
                  <CostRow
                    label="Soldagem + Usinagem & Pintura"
                    val={fmtBRL(
                      costBreakdown.weldingCostBRL + costBreakdown.machiningAndPaintingCostBRL,
                    )}
                  />
                  <CostRow
                    label="Mão de Obra Direta de Oficina"
                    val={fmtBRL(costBreakdown.directLaborCostBRL)}
                  />
                  <div className="border-t border-line pt-1.5 font-semibold">
                    <CostRow
                      label="1. Subtotal Custo Direto"
                      val={fmtBRL(costBreakdown.totalDirectCostBRL)}
                    />
                  </div>
                  <CostRow
                    label="2. Consumíveis, Frete & Impostos Indiretos"
                    val={fmtBRL(costBreakdown.additionalAndIndirectCostBRL)}
                  />
                  <CostRow
                    label={`3. Margem Comercial & BDI (${costMarginBdiPct}%)`}
                    val={fmtBRL(costBreakdown.commercialMarginAmountBRL)}
                  />
                </div>

                <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase text-accent">
                      Preço Técnico Sugerido
                    </span>
                    <strong className="font-mono text-lg font-bold tabular-nums text-accent">
                      {fmtBRL(costBreakdown.suggestedTechnicalPriceBRL)}
                    </strong>
                  </div>

                  <label className="block pt-1 border-t border-accent/20">
                    <span className="font-mono text-[9.5px] uppercase text-muted-foreground">
                      Orçamento Comercial Fechado c/ Cliente (opcional — R$)
                    </span>
                    <input
                      inputMode="decimal"
                      value={approvedCommercialOverride}
                      onChange={(e) => setApprovedCommercialOverride(e.target.value)}
                      placeholder={String(costBreakdown.suggestedTechnicalPriceBRL)}
                      className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-foreground outline-none focus:border-accent"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleEmitImmutableProposal}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase text-background shadow-sm hover:opacity-90 transition-opacity"
                >
                  <FileCheck2 className="size-4" />
                  Emitir Proposta Técnica &amp; Comercial (Snapshot Rev.)
                </button>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DESTINO 5: OFICINA & CHÃO DE FÁBRICA (🔧)                           */}
      {/* =================================================================== */}
      {activeDest === "oficina" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-line bg-card/85 p-1.5">
            {(
              [
                { id: "bancada", label: "Bancada & Peças do Lote" },
                { id: "ficha_qr", label: "Ficha de Produção & QR" },
                { id: "etapas", label: "Etapas de Chão de Fábrica" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setOficinaSub(s.id)}
                className={cn(
                  "rounded-xl px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-tight transition-all text-center",
                  oficinaSub === s.id
                    ? "bg-accent text-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {oficinaSub === "bancada" && <Oficina embedded={true} />}

          {oficinaSub === "ficha_qr" && (() => {
            const targetWork = activeWork ?? projects[0];
            if (!targetWork) return null;
            return (
              <Panel className="p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase text-accent">
                      FICHA DE PRODUÇÃO, RASTREABILIDADE &amp; INSPEÇÃO DIMENSIONAL
                    </span>
                    <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {targetWork.name} ({targetWork.code ?? "OS-001"} · Rev. {targetWork.revision})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Cliente: {targetWork.client || "Cliente Industrial"} ·{" "}
                      {targetWork.parts.length} peça(s)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQrScanOpen(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-xs font-bold uppercase text-accent"
                    >
                      <Camera className="size-4" /> QR Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 font-mono text-xs font-bold uppercase text-background"
                    >
                      <Printer className="size-4" /> Imprimir Ficha QR
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[180px_1fr] items-center">
                  <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-white p-3">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR Code da OS ${targetWork.code ?? targetWork.name}`}
                        referrerPolicy="no-referrer"
                        className="size-36 object-contain"
                      />
                    ) : (
                      <QrCode className="size-24 text-slate-900" />
                    )}
                    <span className="mt-1 font-mono text-[10px] font-bold text-slate-900">
                      {targetWork.code ?? "OS-001"} · REV {targetWork.revision}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-mono text-[10.5px] font-bold uppercase text-muted-foreground">
                      Checklist de Inspeção Dimensional &amp; Liberação de Qualidade
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Conferência de espessura de chapa e certificado de liga",
                        "Tolerância dimensional de corte CNC (±0,5 mm NBR)",
                        "Esquadro, ângulos de dobra e dedução de Fator K",
                        "Inspeção visual de cordões de solda e acabamento",
                      ].map((item) => (
                        <label
                          key={item}
                          className="flex items-center gap-2 rounded-xl border border-line bg-background/50 p-2.5 text-xs text-foreground"
                        >
                          <input
                            type="checkbox"
                            defaultChecked
                            className="size-4 accent-[var(--accent)]"
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })()}

          {oficinaSub === "etapas" && (() => {
            const targetWork = activeWork ?? projects[0];
            if (!targetWork) return null;
            const currentStep = getShopStep(targetWork);
            const currentStepIdx = SHOP_FLOOR_STEPS.findIndex((s) => s.id === currentStep);
            return (
              <Panel className="p-4 space-y-4">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase text-accent">
                    APONTAMENTO DE CHÃO DE FÁBRICA EM TEMPO REAL
                  </span>
                  <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    {targetWork.name} · {targetWork.code ?? "OS-001"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Selecione a estação atual da peça/lote na oficina para atualizar o progresso em todo o sistema.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {SHOP_FLOOR_STEPS.map((st, idx) => {
                    const isCurrent = st.id === currentStep;
                    const isPassed = idx < currentStepIdx;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setShopStepFor(targetWork.id, st.id);
                          toast.success(`Estação de oficina atualizada: ${st.label}`);
                        }}
                        className={cn(
                          "flex flex-col justify-between rounded-xl border p-3 text-left transition-all",
                          isCurrent
                            ? "border-accent bg-accent/15 ring-1 ring-accent/40"
                            : isPassed
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-line bg-background/40 hover:border-accent/40",
                        )}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span className="font-bold uppercase text-muted-foreground">
                            Estação {idx + 1}/8
                          </span>
                          <span className="font-bold tabular-nums text-accent">
                            {st.pctWeight}%
                          </span>
                        </div>
                        <p className="mt-1 font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                          {st.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            );
          })()}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAIS DE APOIO: NOVO TRABALHO, NOVA PEÇA, EDITAR PEÇA, QR SCAN     */}
      {/* =================================================================== */}
      <NewProjectDialog
        open={creatingWork}
        onOpenChange={setCreatingWork}
        onCreate={(input) => {
          const created = createProject(input);
          setCreatingWork(false);
          setActiveWorkId(created.id);
          setWorkStageFor(created.id, "cadastro");
          toast.success(`Ordem de serviço "${created.name}" criada com sucesso!`);
        }}
      />

      {addingPartWorkId && (
        <AddPartDialog
          open={Boolean(addingPartWorkId)}
          onOpenChange={(v) => !v && setAddingPartWorkId(null)}
          onAdd={(input) => {
            addPart(addingPartWorkId, input);
            markGeometryChanged(addingPartWorkId);
            setAddingPartWorkId(null);
            toast.success("Peça adicionada ao trabalho! Nesting e Custos marcados para revisão.");
          }}
        />
      )}

      {/* Modal de Edição de Peça com Propagação Seletiva de Dependências */}
      {editingPart && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="font-display text-base font-bold text-foreground">
                Editar Peça · {editingPart.part.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPart(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block col-span-2">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Nome da Peça
                </span>
                <input
                  value={editingPart.part.name}
                  onChange={(e) =>
                    setEditingPart({
                      ...editingPart,
                      part: { ...editingPart.part, name: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-xs text-foreground"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Quantidade (un)
                </span>
                <input
                  type="number"
                  value={editingPart.part.quantity}
                  onChange={(e) =>
                    setEditingPart({
                      ...editingPart,
                      part: {
                        ...editingPart.part,
                        quantity: Math.max(1, Number(e.target.value)),
                      },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-background px-2.5 py-1.5 font-mono text-xs tabular-nums text-foreground"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Espessura (mm)
                </span>
                <input
                  type="number"
                  step={0.5}
                  value={editingPart.part.thickness}
                  onChange={(e) =>
                    setEditingPart({
                      ...editingPart,
                      part: {
                        ...editingPart.part,
                        thickness: Math.max(0.5, Number(e.target.value)),
                      },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-background px-2.5 py-1.5 font-mono text-xs tabular-nums text-foreground"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPart(null)}
                className="rounded-xl border border-line px-3 py-1.5 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  updatePart(editingPart.workId, editingPart.part.instanceId, {
                    name: editingPart.part.name,
                    quantity: editingPart.part.quantity,
                    thickness: editingPart.part.thickness,
                    revision: (editingPart.part.revision ?? 1) + 1,
                  });
                  markGeometryChanged(editingPart.workId);
                  setEditingPart(null);
                  toast.success(
                    "Peça atualizada! Nesting, BOM e Custos sinalizados para revalidação.",
                  );
                }}
                className="rounded-xl bg-accent px-3.5 py-1.5 font-mono text-xs font-bold uppercase text-background"
              >
                Salvar &amp; Propagar Revisão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Leitura / Localização QR Scan */}
      {qrScanOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-2">
                <QrCode className="size-4 text-accent" />
                <h3 className="font-display text-base font-bold text-foreground">
                  Localizar Ordem de Serviço / Peça via QR Code
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQrScanOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Escaneie a etiqueta QR da ficha de bancada ou selecione uma Ordem de Serviço ativa abaixo:
            </p>

            <input
              value={qrScanInput}
              onChange={(e) => setQrScanInput(e.target.value)}
              placeholder="Ex: PRJ-001, Chaminé Industrial, Flange..."
              className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent"
            />

            <div className="space-y-1.5">
              <span className="font-mono text-[9.5px] uppercase text-muted-foreground">
                Leitura Rápida de Etiquetas QR Ativas na Oficina:
              </span>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkId(p.id);
                    setQrScanOpen(false);
                    setActiveDest("oficina");
                    setOficinaSub("ficha_qr");
                    toast.success(`Ficha QR aberta: ${p.name} (${p.code ?? p.id})`);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-background/60 px-3 py-2 text-left text-xs hover:border-accent"
                >
                  <span>
                    <strong className="font-mono text-accent">{p.code ?? "OS"}</strong> · {p.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Rev. {p.revision} →
                  </span>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQrScanOpen(false)}
                className="rounded-xl border border-line px-3 py-1.5 text-xs"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleQrScanLookup}
                className="rounded-xl bg-accent px-3.5 py-1.5 font-mono text-xs font-bold uppercase text-background"
              >
                Localizar OS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumBox({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9.5px] uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-line bg-background/70 px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums text-foreground outline-none focus:border-accent"
      />
    </label>
  );
}

function CostRow({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{val}</span>
    </div>
  );
}
