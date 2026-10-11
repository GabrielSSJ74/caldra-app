import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  FolderKanban,
  FileText,
  Wrench,
  Plus,
  ChevronRight,
  Grid2x2,
  Wallet,
  Receipt,
  QrCode,
  Layers,
  Clock,
  ArrowRight,
  ExternalLink,
  Flame,
  Activity,
  Scissors,
  CheckCircle2,
  Sparkles,
  Box,
} from "lucide-react";
import {
  useProjects,
  createProject,
  type NewProjectInput,
  type Project,
  PROJECT_STATUS_LABEL,
} from "@/lib/projects/store";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/produzir")({
  head: () => ({
    meta: [
      { title: "Orce e Fabrique — Produzir | CALDRA" },
      {
        name: "description",
        content:
          "Gestão de projetos de fabricação, documentação técnica, gabaritos, orçamentos e ferramentas de oficina metálica.",
      },
      { property: "og:title", content: "Orce e Fabrique — Produzir | CALDRA" },
      {
        property: "og:description",
        content: "Organize projetos, emita documentação de corte e execute na oficina com precisão.",
      },
    ],
  }),
  component: ProduzirPage,
});

/* =========================================================================
   1. ILUSTRAÇÕES TÉCNICAS VETORIAIS (NETFLIX CINEMA + CAD INDUSTRIAL)
   ========================================================================= */

/** Ilustração técnica de chapa de aço com Nesting CNC e feixe de corte */
function SheetNestingGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="metalPlateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E222D" />
          <stop offset="50%" stopColor="#151821" />
          <stop offset="100%" stopColor="#0E1017" />
        </linearGradient>
        <linearGradient id="laserBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Chapa base retangular 1200x3000mm standard */}
      <rect
        x="6"
        y="6"
        width="188"
        height="98"
        rx="6"
        fill="url(#metalPlateGrad)"
        stroke="#2E3444"
        strokeWidth="1.2"
      />

      {/* Grade de coordenadas de corte */}
      <g stroke="#262C3A" strokeWidth="0.5" strokeDasharray="3 3">
        <line x1="6" y1="36" x2="194" y2="36" />
        <line x1="6" y1="68" x2="194" y2="68" />
        <line x1="55" y1="6" x2="55" y2="104" />
        <line x1="110" y1="6" x2="110" y2="104" />
        <line x1="160" y1="6" x2="160" y2="104" />
      </g>

      {/* Peça 1: Disco flangeado com furos */}
      <circle cx="34" cy="52" r="22" stroke="#10B981" strokeWidth="1.2" fill="#10B981" fillOpacity="0.08" />
      <circle cx="34" cy="52" r="10" stroke="#10B981" strokeWidth="0.8" strokeDasharray="2 1.5" />
      <circle cx="34" cy="38" r="2" fill="#38BDF8" />
      <circle cx="34" cy="66" r="2" fill="#38BDF8" />
      <circle cx="20" cy="52" r="2" fill="#38BDF8" />
      <circle cx="48" cy="52" r="2" fill="#38BDF8" />

      {/* Peça 2: Setor de cone planificado */}
      <path
        d="M 68 84 L 86 20 C 104 18, 128 24, 142 38 L 126 84 C 110 76, 88 76, 68 84 Z"
        stroke="#F59E0B"
        strokeWidth="1.2"
        fill="#F59E0B"
        fillOpacity="0.09"
      />
      <path d="M 78 52 C 92 48, 114 54, 126 62" stroke="#F59E0B" strokeWidth="0.6" strokeDasharray="2 2" />

      {/* Peça 3: Retângulo de reforço com chanfros */}
      <polygon
        points="152,22 184,22 188,26 188,70 184,74 152,74 148,70 148,26"
        stroke="#38BDF8"
        strokeWidth="1.1"
        fill="#38BDF8"
        fillOpacity="0.07"
      />
      <circle cx="168" cy="48" r="4" stroke="#38BDF8" strokeWidth="0.7" />

      {/* Cabeçote Laser CNC com ponto de queima */}
      <circle cx="106" cy="32" r="3.5" fill="#EF4444" className="animate-pulse" />
      <circle cx="106" cy="32" r="7" stroke="#EF4444" strokeWidth="0.8" strokeOpacity="0.6" />
      <line x1="106" y1="10" x2="106" y2="28" stroke="#EF4444" strokeWidth="0.7" strokeDasharray="2 1" />
      <line x1="84" y1="32" x2="102" y2="32" stroke="#EF4444" strokeWidth="0.7" strokeDasharray="2 1" />

      {/* Cotas e dados de aproveitamento */}
      <text x="12" y="20" fill="#64748B" fontSize="6" fontFamily="monospace" fontWeight="600">
        CHAPA #1020 • e=6.35mm
      </text>
      <text x="136" y="98" fill="#10B981" fontSize="7" fontFamily="monospace" fontWeight="bold">
        91.8% UTIL
      </text>
    </svg>
  );
}

/** Ilustração técnica da Ficha de Produção com QR e Rastreabilidade */
function ProductionTravelerGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Prancha de ordem de serviço */}
      <rect x="8" y="6" width="144" height="78" rx="5" fill="#12151D" stroke="#2A3040" strokeWidth="1" />
      
      {/* Cabeçalho da ficha */}
      <line x1="8" y1="26" x2="152" y2="26" stroke="#2A3040" strokeWidth="0.8" />
      <rect x="14" y="11" width="38" height="8" rx="2" fill="#38BDF8" fillOpacity="0.15" />
      <text x="17" y="17" fill="#38BDF8" fontSize="5" fontFamily="monospace" fontWeight="bold">
        OS #CALDRA-094
      </text>
      
      {/* QR Code estilizado */}
      <rect x="14" y="32" width="34" height="34" rx="3" fill="#0A0C10" stroke="#38BDF8" strokeWidth="0.8" />
      <rect x="18" y="36" width="9" height="9" fill="#38BDF8" />
      <rect x="35" y="36" width="9" height="9" fill="#38BDF8" />
      <rect x="18" y="53" width="9" height="9" fill="#38BDF8" />
      <rect x="30" y="48" width="4" height="4" fill="#38BDF8" />
      <rect x="39" y="55" width="5" height="5" fill="#38BDF8" />

      {/* Roteiro de fabricação (checkpoints) */}
      <g>
        <circle cx="62" cy="38" r="3.5" fill="#10B981" />
        <text x="70" y="40" fill="#E2E8F0" fontSize="5.5" fontFamily="sans-serif" fontWeight="600">
          01. Corte CNC (Validado)
        </text>

        <circle cx="62" cy="52" r="3.5" fill="#F59E0B" />
        <text x="70" y="54" fill="#E2E8F0" fontSize="5.5" fontFamily="sans-serif" fontWeight="600">
          02. Calandragem R=450mm
        </text>

        <circle cx="62" cy="66" r="3.5" fill="#475569" />
        <text x="70" y="68" fill="#94A3B8" fontSize="5.5" fontFamily="sans-serif">
          03. Soldagem & Teste END
        </text>
      </g>
    </svg>
  );
}

/** Ilustração técnica de Pranchas e Gabaritos CAD 1:1 */
function CadBlueprintTravelerGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="8" y="6" width="144" height="78" rx="5" fill="#0F1218" stroke="#1E293B" strokeWidth="1" />
      
      {/* Linhas de grade blueprint */}
      <g stroke="#1E293B" strokeWidth="0.5">
        <line x1="8" y1="30" x2="152" y2="30" />
        <line x1="8" y1="55" x2="152" y2="55" />
        <line x1="45" y1="6" x2="45" y2="84" />
        <line x1="90" y1="6" x2="90" y2="84" />
        <line x1="130" y1="6" x2="130" y2="84" />
      </g>

      {/* Geometria isométrica de curva de gomos */}
      <path
        d="M 30 65 L 50 65 L 75 40 L 95 40 L 115 20 L 130 20"
        stroke="#38BDF8"
        strokeWidth="1.4"
      />
      <path
        d="M 30 75 L 56 75 L 85 46 L 105 46 L 125 26 L 130 26"
        stroke="#38BDF8"
        strokeWidth="1.4"
      />
      <line x1="50" y1="65" x2="56" y2="75" stroke="#F59E0B" strokeWidth="1" />
      <line x1="75" y1="40" x2="85" y2="46" stroke="#F59E0B" strokeWidth="1" />
      <line x1="95" y1="40" x2="105" y2="46" stroke="#F59E0B" strokeWidth="1" />
      <line x1="115" y1="20" x2="125" y2="26" stroke="#F59E0B" strokeWidth="1" />

      {/* Linhas de cota e tolerância */}
      <line x1="30" y1="80" x2="130" y2="80" stroke="#64748B" strokeWidth="0.7" strokeDasharray="2 1" />
      <text x="65" y="82" fill="#94A3B8" fontSize="5" fontFamily="monospace">
        ESCALA 1:1 • DXF R12
      </text>
    </svg>
  );
}

/** Ilustração técnica de Custos e Orçamentos da Oficina */
function WorkshopEconomicsGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="8" y="6" width="144" height="78" rx="5" fill="#0C1310" stroke="#132B20" strokeWidth="1" />

      {/* Gráfico de barras de composição de custos */}
      <g>
        {/* Barra 1: Material */}
        <rect x="22" y="38" width="16" height="36" rx="2" fill="#10B981" />
        <text x="22" y="32" fill="#10B981" fontSize="5" fontFamily="monospace" fontWeight="bold">
          45%
        </text>
        <text x="20" y="80" fill="#6EE7B7" fontSize="4.5" fontFamily="sans-serif">
          Matéria
        </text>

        {/* Barra 2: Máquina / Corte */}
        <rect x="52" y="46" width="16" height="28" rx="2" fill="#38BDF8" />
        <text x="52" y="40" fill="#38BDF8" fontSize="5" fontFamily="monospace" fontWeight="bold">
          30%
        </text>
        <text x="50" y="80" fill="#BAE6FD" fontSize="4.5" fontFamily="sans-serif">
          Máquina
        </text>

        {/* Barra 3: Mão de Obra */}
        <rect x="82" y="56" width="16" height="18" rx="2" fill="#F59E0B" />
        <text x="82" y="50" fill="#F59E0B" fontSize="5" fontFamily="monospace" fontWeight="bold">
          15%
        </text>
        <text x="80" y="80" fill="#FDE68A" fontSize="4.5" fontFamily="sans-serif">
          Solda
        </text>

        {/* Barra 4: Margem */}
        <rect x="112" y="42" width="16" height="32" rx="2" fill="#8B5CF6" />
        <text x="112" y="36" fill="#8B5CF6" fontSize="5" fontFamily="monospace" fontWeight="bold">
          25%
        </text>
        <text x="110" y="80" fill="#DDD6FE" fontSize="4.5" fontFamily="sans-serif">
          Margem
        </text>
      </g>

      {/* Linha de total / margem de contribuição */}
      <line x1="16" y1="20" x2="144" y2="20" stroke="#1E4432" strokeWidth="0.8" />
      <text x="18" y="16" fill="#10B981" fontSize="5.5" fontFamily="monospace" fontWeight="bold">
        FORMAÇÃO DE PREÇO COMERCIAL (BDI)
      </text>
    </svg>
  );
}

/* =========================================================================
   2. CATEGORIAS DE FILTRO PARA CARROSSEL DE PROJETOS (UX NETFLIX)
   ========================================================================= */

type ProjectFilter = "todos" | "em-producao" | "em-desenvolvimento" | "concluido";

const PROJECT_FILTERS: { id: ProjectFilter; label: string }[] = [
  { id: "todos", label: "Todos os Dossiês" },
  { id: "em-producao", label: "Em Produção" },
  { id: "em-desenvolvimento", label: "Em Desenvolvimento" },
  { id: "concluido", label: "Concluídos" },
];

/* Projetos modelo para preencher o ambiente visual caso o usuário esteja iniciando */
const DEMO_PROJECTS: Array<Pick<Project, "id" | "name" | "client" | "status" | "parts">> = [
  {
    id: "demo-spool-01",
    name: "Spool & Linha de Vapor 400mm",
    client: "Refinaria Norte • Linha B",
    status: "em-producao",
    parts: [
      { instanceId: "p1", modelId: "curva-de-gomos", code: "CV-01", name: "Curva 90° 4 Gomos", parameters: {}, material: "ASTM A-106", thickness: 8, quantity: 4, status: "em-producao", notes: "", revision: "A", createdAt: 0, updatedAt: 0, version: 1 },
      { instanceId: "p2", modelId: "tronco-de-cone", code: "RD-01", name: "Redução Cônica", parameters: {}, material: "ASTM A-106", thickness: 8, quantity: 2, status: "validada", notes: "", revision: "A", createdAt: 0, updatedAt: 0, version: 1 },
    ],
  },
  {
    id: "demo-tanque-02",
    name: "Tanque Cônico de Decantação Ø1800",
    client: "Indústria de Papel & Celulose",
    status: "em-desenvolvimento",
    parts: [
      { instanceId: "p3", modelId: "tronco-de-cone", code: "TQ-01", name: "Fundo Cônico 60°", parameters: {}, material: "Inox 304L", thickness: 6.35, quantity: 1, status: "rascunho", notes: "", revision: "A", createdAt: 0, updatedAt: 0, version: 1 },
      { instanceId: "p4", modelId: "quadrado-redondo", code: "TQ-02", name: "Boca de Alimentação", parameters: {}, material: "Inox 304L", thickness: 4.75, quantity: 1, status: "rascunho", notes: "", revision: "A", createdAt: 0, updatedAt: 0, version: 1 },
    ],
  },
  {
    id: "demo-duto-03",
    name: "Duto de Exaustão & Ciclone Ø1200",
    client: "Cerâmica Industrial",
    status: "em-producao",
    parts: [
      { instanceId: "p5", modelId: "quadrado-redondo", code: "EX-01", name: "Transição Quadrado-Redondo", parameters: {}, material: "Aço A-36", thickness: 4.75, quantity: 2, status: "em-producao", notes: "", revision: "B", createdAt: 0, updatedAt: 0, version: 1 },
    ],
  },
];

/* =========================================================================
   3. COMPONENTE PRINCIPAL DA PÁGINA PRODUZIR
   ========================================================================= */

function ProduzirPage() {
  const navigate = useNavigate();
  const realProjects = useProjects();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<ProjectFilter>("todos");

  const handleCreateProject = (input: NewProjectInput) => {
    try {
      const created = createProject(input);
      setNewProjectOpen(false);
      triggerHaptic("success");
      AudioManager.play("ui_pop");
      void navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
    } catch (e) {
      console.error("Falha ao criar projeto:", e);
    }
  };

  // Se houver projetos reais, usamos eles; caso contrário, demonstramos projetos para a experiência visual rica
  const allProjects = useMemo(() => {
    if (realProjects.length > 0) return realProjects;
    return DEMO_PROJECTS as unknown as Project[];
  }, [realProjects]);

  // Projeto mais recente em destaque para o Banner Cinema
  const featuredProject = useMemo(() => {
    if (realProjects.length > 0) {
      return [...realProjects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    return DEMO_PROJECTS[0] as unknown as Project;
  }, [realProjects]);

  // Filtragem para o carrossel de cards estilo streaming
  const filteredProjects = useMemo(() => {
    if (selectedFilter === "todos") return allProjects;
    return allProjects.filter((p) => {
      if (selectedFilter === "em-producao") return p.status === "em-producao";
      if (selectedFilter === "em-desenvolvimento") return p.status === "em-desenvolvimento" || p.status === "rascunho";
      if (selectedFilter === "concluido") return p.status === "concluido" || p.status === "entregue";
      return true;
    });
  }, [allProjects, selectedFilter]);

  // Estatística de chão de fábrica
  const totalPartsInProduction = useMemo(() => {
    return allProjects.reduce((acc, p) => acc + (p.parts?.length || 0), 0);
  }, [allProjects]);

  return (
    <div className="relative w-full min-h-screen bg-[#0A0B0E] text-white flex flex-col items-center overflow-x-hidden selection:bg-amber-500/30 selection:text-amber-200">
      {/* Container centralizado com proporções estritamente sem bordas brancas laterais */}
      <div className="relative w-full max-w-md space-y-4 px-3 pb-[calc(6rem+env(safe-area-inset-bottom,20px))] pt-1">
        
        {/* =========================================================================
            A. IDENTIFICADOR DA ÁREA (SEM CABEÇALHO GLOBAL REDUNDANTE)
            - Marca de módulo: "ORCE E FABRIQUE — PRODUÇÃO & OFICINA"
            - Identidade industrial com LED pulsante verde/esmeralda
            ========================================================================= */}
        <section className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-[0.22em] uppercase text-zinc-400">
                  OFICINA & FABRICAÇÃO
                </span>
                <span className="rounded bg-emerald-500/10 px-1 py-0.2 font-mono text-[8px] font-bold text-emerald-400 border border-emerald-500/30">
                  CALDRA SHOP
                </span>
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-zinc-100">
                Orce e Fabrique
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
            <Activity className="size-3 text-emerald-400" />
            <span>{totalPartsInProduction} PEÇAS EM LINHA</span>
          </div>
        </section>

        {/* =========================================================================
            B. BANNER HERO DE PRODUÇÃO — AMBIENTE CINEMATOGRÁFICO DE CORTE & GESTÃO
            - Estética profissional Netflix / Cinema de Engenharia
            - Destaque para o projeto ativo ou linha de corte integrada
            - Gráfico técnico vetorial de aproveitamento de chapa & nesting
            - Ações de criação direta e gerenciamento de dossiês
            ========================================================================= */}
        <section
          aria-label="Central de Fabricação em Destaque"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#13161F] to-[#0A0D12] shadow-2xl p-3.5 space-y-3"
        >
          {/* Header do Hero: Status de Produção + Identificador */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shrink-0">
                <Flame className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold text-emerald-400 uppercase">
                    01 • CHÃO DE FÁBRICA
                  </span>
                  <span className="font-mono text-[8px] text-zinc-400 bg-zinc-800/80 px-1 rounded">
                    CNC & MONTAGEM
                  </span>
                </div>
                <h2 className="font-display text-sm font-bold text-zinc-100 truncate">
                  {featuredProject?.name || "Ordem de Fabricação CALDRA"}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[8px] font-semibold text-emerald-400">
                <span className="size-1 rounded-full bg-emerald-400 animate-pulse" />
                {PROJECT_STATUS_LABEL[featuredProject?.status || "em-producao"]}
              </span>
            </div>
          </div>

          {/* Viewport Visual do Hero: Nesting em Chapa Metálica */}
          <div className="relative h-44 w-full rounded-xl border border-zinc-800/90 bg-gradient-to-b from-[#090C12] to-[#06080C] overflow-hidden flex items-center justify-center">
            {/* Grid blueprint industrial de fundo */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(#10b981 0.75px, transparent 0.75px), radial-gradient(#38bdf8 0.5px, transparent 0.5px)",
                backgroundSize: "20px 20px, 40px 40px",
                backgroundPosition: "0 0, 10px 10px",
              }}
            />

            <SheetNestingGraphic className="size-full p-2" />

            {/* Overlay informativo com cotas rápidas */}
            <div className="pointer-events-none absolute bottom-2 left-2.5 flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 px-2 py-0.5 rounded-md text-[9px] font-mono">
              <span className="text-zinc-400">Plano de Corte:</span>
              <span className="text-emerald-400 font-bold">1200 x 3000 mm</span>
              <span className="text-zinc-500">•</span>
              <span className="text-amber-400 font-bold">Zero Desperdício</span>
            </div>
          </div>

          {/* Metadados técnicos do projeto e CTAs operacionais */}
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-900/60 border border-zinc-800/70 p-2">
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">CLIENTE</span>
                <span className="font-mono text-[10px] font-bold text-zinc-200 truncate">
                  {featuredProject?.client || "Oficina Interna"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">VOLUME</span>
                <span className="font-mono text-[10px] font-bold text-emerald-400">
                  {featuredProject?.parts?.length || 0} Peças
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[8px] text-zinc-400 uppercase">EXPEDIÇÃO</span>
                <span className="font-mono text-[10px] font-bold text-amber-400">
                  Pronto p/ Corte
                </span>
              </div>
            </div>

            {/* Ações principais: Novo Projeto + Abrir Dossiês */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("success");
                  AudioManager.play("ui_action");
                  setNewProjectOpen(true);
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-700 px-3.5 py-2.5 font-display text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="size-4" strokeWidth={2.4} />
                <span>Criar Novo Projeto</span>
                <ArrowRight className="size-3.5 ml-auto text-zinc-950" />
              </button>

              <Link
                to="/projetos"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }}
                className="flex items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/80 px-3 py-2.5 font-mono text-xs font-semibold text-zinc-300 hover:bg-zinc-700 active:scale-[0.98] transition-all cursor-pointer"
                title="Ver todos os projetos salvos"
              >
                <span>Dossiês</span>
                <ChevronRight className="size-3.5 text-zinc-400 ml-0.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* =========================================================================
            C. CARROSSEL HORIZONTAL DE PROJETOS (UX ESTILO NETFLIX)
            - Faixa deslizável com proporções cinematográficas
            - Cards escuros com bordas finas e informações técnicas diretas
            - Filtro de abas por status de produção
            ========================================================================= */}
        <section aria-label="Projetos em Andamento" className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-zinc-200">
                Dossiês & Pacotes de Fabricação
              </h2>
            </div>
            <Link
              to="/projetos"
              className="font-mono text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
            >
              <span>Ver todos ({allProjects.length})</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Filtros em abas deslizantes sutis */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {PROJECT_FILTERS.map((filter) => {
              const active = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setSelectedFilter(filter.id);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold transition-all cursor-pointer",
                    active
                      ? "bg-emerald-500 text-zinc-950 font-bold shadow-md shadow-emerald-500/20"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700",
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Carrossel de Cards Horizontais */}
          <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar snap-x">
            {/* Card para criação rápida */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_pop");
                setNewProjectOpen(true);
              }}
              className="group relative flex w-36 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 p-3 hover:border-emerald-500/60 hover:bg-zinc-900/80 active:scale-95 transition-all snap-start cursor-pointer text-center"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 group-hover:scale-110 transition-transform">
                <Plus className="size-5" />
              </div>
              <span className="mt-2 font-display text-[11px] font-bold text-zinc-200">
                Novo Dossiê
              </span>
              <span className="font-mono text-[8px] text-zinc-400 mt-0.5">
                Iniciar pacote de peças
              </span>
            </button>

            {filteredProjects.map((p) => {
              const isReal = realProjects.some((rp) => rp.id === p.id);
              const partCount = p.parts?.length || 0;
              const statusLabel = PROJECT_STATUS_LABEL[p.status] || "Em produção";

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_nav");
                    if (isReal) {
                      void navigate({ to: "/projetos/$projectId", params: { projectId: p.id } });
                    } else {
                      setNewProjectOpen(true);
                    }
                  }}
                  className="group relative flex w-44 shrink-0 flex-col rounded-xl border border-zinc-800/90 bg-gradient-to-b from-[#13161F] to-[#0A0D12] p-2.5 transition-all hover:border-emerald-500/50 hover:shadow-lg active:scale-95 snap-start cursor-pointer"
                >
                  {/* Thumbnail técnica com indicador de status */}
                  <div className="relative h-20 w-full rounded-lg bg-[#07090D] border border-zinc-800/80 overflow-hidden flex flex-col justify-between p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[7px] font-bold text-emerald-400 uppercase bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-800/60">
                        {statusLabel}
                      </span>
                      <span className="font-mono text-[8px] text-zinc-400">
                        {partCount} {partCount === 1 ? "peça" : "peças"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <FolderKanban className="size-4 text-emerald-400 shrink-0" />
                      <span className="font-mono text-[9px] text-zinc-300 font-semibold truncate">
                        {p.client || "Cliente Direto"}
                      </span>
                    </div>
                  </div>

                  {/* Informações do projeto */}
                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="font-display text-xs font-bold text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
                      {p.name}
                    </span>
                    <span className="font-mono text-[8px] text-zinc-400 line-clamp-1 mt-0.5">
                      {p.client ? `Obra: ${p.client}` : "Dossiê técnico padrão"}
                    </span>
                  </div>

                  {/* Barra de progresso visual */}
                  <div className="mt-2 w-full bg-zinc-800/80 h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all"
                      style={{
                        width:
                          p.status === "concluido" || p.status === "entregue"
                            ? "100%"
                            : p.status === "em-producao"
                              ? "65%"
                              : "25%",
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between pt-1 border-t border-zinc-800/70 text-[9px] font-mono text-emerald-400">
                    <span>Acessar Peças</span>
                    <ArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* =========================================================================
            D. DESENHOS TÉCNICOS E GABARITOS (AZUL-CIANO / ÂMBAR)
            - Ficha de produção com QR code e documentação técnica
            - Pranchas em PDF e gabaritos de bancada
            - Motor vetorial CAD
            ========================================================================= */}
        <section
          aria-labelledby="section-documentos"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#121620] to-[#0A0D14] p-3.5 space-y-3 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-400 shrink-0 shadow-inner">
                <FileText className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-sky-400">02</span>
                  <h2 id="section-documentos" className="font-display text-sm font-bold text-zinc-100">
                    Desenhos Técnicos & Gabaritos
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Pranchas para corte, arquivos CAD e fichas de bancada com QR.
                </p>
              </div>
            </div>

            <Link
              to="/oficina"
              search={{ tab: "ficha" }}
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Fichas</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Cards Visuais da Documentação Técnica */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Card 1: Ficha de Bancada QR */}
            <Link
              to="/oficina"
              search={{ tab: "ficha" }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#090C12] p-2.5 hover:border-sky-500/50 transition-all active:scale-[0.98]"
            >
              <div className="relative h-24 w-full rounded-lg bg-[#06080E] border border-zinc-800/80 overflow-hidden flex items-center justify-center">
                <ProductionTravelerGraphic className="size-full" />
                <div className="absolute top-1.5 right-1.5 bg-zinc-950/80 border border-zinc-800 rounded px-1.5 py-0.5 text-[8px] font-mono text-sky-400">
                  QR SCAN
                </div>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold text-zinc-100 group-hover:text-sky-400 transition-colors">
                    Ficha de Produção (QR)
                  </h3>
                  <QrCode className="size-3.5 text-sky-400" />
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-2">
                  Rastreabilidade de corte, dobras, inspeção dimensional e montagem.
                </p>
              </div>

              <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-zinc-800/60 font-mono text-[9px] text-sky-400">
                <span>Emitir Ficha de Bancada</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>

            {/* Card 2: Pranchas & Gabaritos CAD 1:1 */}
            <Link
              to="/desenho-2d"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#090C12] p-2.5 hover:border-sky-500/50 transition-all active:scale-[0.98]"
            >
              <div className="relative h-24 w-full rounded-lg bg-[#06080E] border border-zinc-800/80 overflow-hidden flex items-center justify-center">
                <CadBlueprintTravelerGraphic className="size-full" />
                <div className="absolute top-1.5 right-1.5 bg-zinc-950/80 border border-zinc-800 rounded px-1.5 py-0.5 text-[8px] font-mono text-amber-400">
                  DXF / SVG
                </div>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">
                    Pranchas e Gabaritos CAD
                  </h3>
                  <Layers className="size-3.5 text-amber-400" />
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-2">
                  Exportação de contornos e arquivos DXF 1:1 para mesa de corte CNC.
                </p>
              </div>

              <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-zinc-800/60 font-mono text-[9px] text-amber-400">
                <span>Abrir Editor Vetorial</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            E. OFICINA, NESTING & CUSTOS (VERDE-ESMERALDA / TURQUESA)
            - Chapa e aproveitamento de corte (nesting de retalho)
            - Custos de fabricação (tarifas horárias de laser, calandra, solda)
            - Orçamentos comerciais (margem, impostos e proposta PDF)
            ========================================================================= */}
        <section
          aria-labelledby="section-oficina"
          className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#121815] to-[#0A0E0C] p-3.5 space-y-3 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shrink-0 shadow-inner">
                <Wrench className="size-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-emerald-400">03</span>
                  <h2 id="section-oficina" className="font-display text-sm font-bold text-zinc-100">
                    Oficina & Custos de Fabricação
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Nesting de chapas, tarifas de máquina e orçamentos em PDF.
                </p>
              </div>
            </div>

            <Link
              to="/oficina"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Abrir Oficina</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Gráfico de Economia / Custos Industriais */}
          <div className="relative h-24 w-full rounded-xl border border-zinc-800/80 bg-[#070B09] overflow-hidden flex items-center justify-center">
            <WorkshopEconomicsGraphic className="size-full" />
            <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-center justify-between text-[9px] font-mono">
              <span className="text-zinc-400 bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800">
                TARIFAS ATUALIZADAS
              </span>
              <span className="text-emerald-400 font-bold">MÁXIMA EFICIÊNCIA</span>
            </div>
          </div>

          {/* Grid de módulos especializados */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link
              to="/oficina"
              search={{ tab: "chapa" }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-zinc-900/80 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <Grid2x2 className="size-4 text-emerald-400" />
                <ArrowRight className="size-3 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400" />
              </div>
              <div className="mt-2">
                <span className="font-mono text-xs font-semibold text-zinc-100 block group-hover:text-emerald-400 transition-colors">
                  Chapa & Nesting
                </span>
                <span className="text-[10px] text-zinc-400">
                  Retalhos e otimização
                </span>
              </div>
            </Link>

            <Link
              to="/oficina"
              search={{ tab: "custo" }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-zinc-900/80 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <Wallet className="size-4 text-sky-400" />
                <ArrowRight className="size-3 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-400" />
              </div>
              <div className="mt-2">
                <span className="font-mono text-xs font-semibold text-zinc-100 block group-hover:text-sky-400 transition-colors">
                  Custos de Máquina
                </span>
                <span className="text-[10px] text-zinc-400">
                  Laser, calandra e solda
                </span>
              </div>
            </Link>

            <Link
              to="/oficina"
              search={{ tab: "orcamento" }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-emerald-500/40 hover:bg-zinc-900/80 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <Receipt className="size-4 text-amber-400" />
                <ArrowRight className="size-3 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-400" />
              </div>
              <div className="mt-2">
                <span className="font-mono text-xs font-semibold text-zinc-100 block group-hover:text-amber-400 transition-colors">
                  Orçamentos PDF
                </span>
                <span className="text-[10px] text-zinc-400">
                  Margens e proposta técnica
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* Rodapé técnico sutil de chão de fábrica */}
        <footer className="pt-2 pb-1 text-center font-mono text-[9px] text-zinc-500">
          CALDRA Metal Shop • Gestão de Produção & Chão de Fábrica • Offline-First
        </footer>
      </div>

      {/* Diálogo de Criação de Projeto (Preservado integralmente) */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
