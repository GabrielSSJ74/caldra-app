import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Box,
  Calculator,
  ChevronRight,
  Clock,
  Compass,
  Folder,
  FolderKanban,
  GraduationCap,
  Layers,
  PenTool,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { CaldraLogo } from "@/components/caldra/Logo";
import { WorkshopCarousel } from "./WorkshopCarousel";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import {
  createProject,
  useProjects,
  type NewProjectInput,
  type Project,
} from "@/lib/projects/store";
import { CHANGELOG, APP_VERSION } from "@/lib/app/version";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Gráfico vetorial de alta precisão: Cabeçote de corte a laser industrial e feixe de fagulhas */
function IndustrialLaserGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 280"
      className={cn("pointer-events-none select-none", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Brilho quente do corte e feixe */}
        <radialGradient id="laser-glow" cx="190" cy="180" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFA000" stopOpacity="0.85" />
          <stop offset="25%" stopColor="#FF5722" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#D84315" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {/* Gradiente da chapa de aço cortada */}
        <linearGradient id="plate-grad" x1="40" y1="180" x2="310" y2="240" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2A2D35" />
          <stop offset="50%" stopColor="#1E2026" />
          <stop offset="100%" stopColor="#141519" />
        </linearGradient>
        {/* Gradiente do bocal da tocha CNC */}
        <linearGradient id="nozzle-grad" x1="160" y1="20" x2="220" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5A6070" />
          <stop offset="40%" stopColor="#3B3F4B" />
          <stop offset="85%" stopColor="#252830" />
          <stop offset="100%" stopColor="#E65100" />
        </linearGradient>
      </defs>

      {/* Grid de desenho técnico de caldeiraria no fundo */}
      <g stroke="#38BDF8" strokeWidth="0.6" strokeOpacity="0.16" strokeDasharray="3 3">
        <line x1="30" y1="50" x2="300" y2="50" />
        <line x1="30" y1="90" x2="300" y2="90" />
        <line x1="30" y1="130" x2="300" y2="130" />
        <line x1="30" y1="170" x2="300" y2="170" />
        <line x1="70" y1="20" x2="70" y2="240" />
        <line x1="130" y1="20" x2="130" y2="240" />
        <line x1="190" y1="20" x2="190" y2="240" />
        <line x1="250" y1="20" x2="250" y2="240" />
        {/* Linhas de cota / referência */}
        <circle cx="190" cy="180" r="45" stroke="#F59E0B" strokeWidth="0.8" strokeOpacity="0.25" />
        <circle cx="190" cy="180" r="75" stroke="#38BDF8" strokeWidth="0.6" strokeOpacity="0.15" />
      </g>

      {/* Chapa metálica chanfrada no plano de corte */}
      <polygon points="50,195 295,140 310,210 65,260" fill="url(#plate-grad)" stroke="#4A5060" strokeWidth="1" strokeOpacity="0.5" />
      {/* Linha de corte incandescente na chapa */}
      <line x1="110" y1="205" x2="190" y2="180" stroke="#FF7043" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="110" y1="205" x2="190" y2="180" stroke="#FFE082" strokeWidth="1" strokeLinecap="round" />

      {/* Halo de luz e plasma incandescente */}
      <circle cx="190" cy="180" r="85" fill="url(#laser-glow)" />

      {/* Feixe de laser de alta potência focalizado */}
      <line x1="190" y1="140" x2="190" y2="180" stroke="#FFF" strokeWidth="2.8" strokeLinecap="round" filter="drop-shadow(0 0 4px #FF9100)" />
      <line x1="190" y1="140" x2="190" y2="180" stroke="#FFE57F" strokeWidth="1.2" strokeLinecap="round" />

      {/* Cabeçote e bocal da tocha CNC de corte a laser */}
      <polygon points="175,20 205,20 208,80 172,80" fill="url(#nozzle-grad)" stroke="#222" strokeWidth="1" />
      <polygon points="172,80 208,80 200,125 180,125" fill="url(#nozzle-grad)" stroke="#333" strokeWidth="0.8" />
      {/* Ponta cônica do bocal */}
      <polygon points="180,125 200,125 192,142 188,142" fill="#E65100" stroke="#FFB74D" strokeWidth="0.6" />

      {/* Fagulhas e partículas industriais incandescentes espalhadas */}
      <g fill="#FFA726">
        <circle cx="193" cy="178" r="3.2" fill="#FFFFFF" />
        <circle cx="178" cy="188" r="1.8" />
        <circle cx="165" cy="198" r="1.3" />
        <circle cx="152" cy="205" r="1.6" />
        <circle cx="140" cy="222" r="1.1" />
        <circle cx="204" cy="192" r="2.2" />
        <circle cx="218" cy="202" r="1.5" />
        <circle cx="235" cy="218" r="1.3" />
        <circle cx="182" cy="166" r="1.6" />
        <circle cx="210" cy="172" r="1.4" />
        <circle cx="198" cy="155" r="1.1" />
        <circle cx="225" cy="185" r="1.7" />
        <circle cx="170" cy="175" r="1.2" />
        {/* Trilhas de faíscas rápidas */}
        <line x1="190" y1="180" x2="162" y2="210" stroke="#FFB74D" strokeWidth="1.1" strokeOpacity="0.85" />
        <line x1="190" y1="180" x2="228" y2="208" stroke="#FFA726" strokeWidth="1" strokeOpacity="0.75" />
        <line x1="190" y1="180" x2="206" y2="225" stroke="#FF7043" strokeWidth="1.2" strokeOpacity="0.8" />
        <line x1="190" y1="180" x2="148" y2="195" stroke="#FFE082" strokeWidth="0.9" strokeOpacity="0.9" />
      </g>
    </svg>
  );
}

/** Gráfico vetorial 3D isométrico: Redução Cônica com linhas de traçagem e cotas */
function ConicalReductionGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn("pointer-events-none select-none", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Gradiente metálico curvo da chapa calandrada */}
        <linearGradient id="cone-steel" x1="30" y1="20" x2="130" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A4E5A" />
          <stop offset="25%" stopColor="#2D3038" />
          <stop offset="55%" stopColor="#555B68" />
          <stop offset="80%" stopColor="#1E2026" />
          <stop offset="100%" stopColor="#3C404B" />
        </linearGradient>
        {/* Brilho da boca superior */}
        <linearGradient id="cone-top-edge" x1="55" y1="25" x2="105" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8A92A2" />
          <stop offset="50%" stopColor="#C4CBD8" />
          <stop offset="100%" stopColor="#6C7280" />
        </linearGradient>
      </defs>

      {/* Linhas de traçado / blueprint suave atrás */}
      <g stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="2 2">
        <line x1="80" y1="5" x2="80" y2="105" stroke="#F59E0B" strokeOpacity="0.4" />
        <line x1="10" y1="85" x2="150" y2="85" />
        <line x1="30" y1="25" x2="130" y2="25" />
        {/* Linha geratriz da traçagem por triangulação */}
        <line x1="60" y1="25" x2="25" y2="85" />
        <line x1="100" y1="25" x2="135" y2="85" />
      </g>

      {/* Superfície do cone truncado calandrado */}
      <path
        d="M 60 25 L 100 25 L 135 85 C 135 95, 25 95, 25 85 Z"
        fill="url(#cone-steel)"
        stroke="#6B7280"
        strokeWidth="1"
      />

      {/* Boca superior (elipse menor) */}
      <ellipse cx="80" cy="25" rx="20" ry="6.5" fill="#1C1E24" stroke="url(#cone-top-edge)" strokeWidth="1.2" />

      {/* Boca inferior (borda frontal da chapa chanfrada) */}
      <path
        d="M 25 85 C 25 97, 135 97, 135 85"
        stroke="#9CA3AF"
        strokeWidth="1.2"
        fill="none"
      />
      {/* Costura de solda longitudinal técnica */}
      <line x1="80" y1="31.5" x2="80" y2="92" stroke="#F59E0B" strokeWidth="0.9" strokeOpacity="0.65" strokeDasharray="2 1" />
    </svg>
  );
}

/** Formatação humanizada de data/hora relativa para projetos */
function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "Atualizado agora mesmo";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Atualizado há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Atualizado há ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Atualizado há ${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;
  const d = new Date(ts);
  return `Atualizado em ${d.toLocaleDateString("pt-BR")}`;
}

export function WorkshopDashboard() {
  const navigate = useNavigate();
  const projects = useProjects();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Manipulador real de criação de novo projeto
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

  // 3 projetos mais recentes reais do usuário, ordenados por data de atualização
  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);

  return (
    <div className="relative mx-auto max-w-4xl space-y-4 pb-28 pt-1 sm:space-y-6 sm:pb-32">
      {/* =========================================================================
          A. CABEÇALHO DA MARCA
          - Logotipo original CALDRA
          - Nome CALDRA em vermelho vibrante oficial
          - Subtítulo discreto "SUA OFICINA DIGITAL"
          - Botões de notificação e configurações
          ========================================================================= */}
      <header className="relative flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <CaldraLogo size={42} animated glow />
          <div className="flex flex-col">
            <span className="font-display text-2xl font-black tracking-tight text-[#FF3B30] sm:text-3xl leading-none select-none">
              CALDRA
            </span>
            <span className="mt-1 font-mono text-[9px] font-semibold tracking-[0.22em] text-muted-foreground dark:text-zinc-400 uppercase sm:text-[10px]">
              SUA OFICINA DIGITAL
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Acesso a Notificações e Atualizações */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
              setNotificationsOpen(true);
            }}
            aria-label="Notificações e novidades do CALDRA"
            className="caldra-bubble-base caldra-bubble-neutral size-10 shadow-xs transition-all duration-150 hover:border-accent/40 active:scale-95 cursor-pointer touch-manipulation"
          >
            <Bell className="size-4.5" />
          </button>

          {/* Acesso a Configurações e Preferências */}
          <Link
            to="/configuracoes"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            aria-label="Abrir configurações"
            className="caldra-bubble-base caldra-bubble-neutral size-10 shadow-xs transition-all duration-150 hover:border-accent/40 active:scale-95 cursor-pointer touch-manipulation"
          >
            <Settings className="size-4.5" />
          </Link>
        </div>
      </header>

      {/* =========================================================================
          B. CARROSSEL ANIMADO INTERATIVO DA OFICINA DIGITAL (5 PILARES)
          - CRIE • CALCULE • ORCE • FABRIQUE • APRIMORE
          - Animações reais em SVG/código técnico, navegação por swipe e indicadores
          ========================================================================= */}
      <WorkshopCarousel
        onNewProject={() => {
          triggerHaptic("selection");
          AudioManager.play("ui_pop");
          setNewProjectOpen(true);
        }}
        onOpenTools={() => {
          triggerHaptic("selection");
          AudioManager.play("ui_pop");
          setToolsOpen(true);
        }}
      />

      {/* =========================================================================
          C. QUATRO CARTÕES PRINCIPAIS (Grade responsiva 2x2)
          1. Novo projeto (Compasso técnico / criação)
          2. Projetos (Cubo 3D / CAD)
          3. Ferramentas (Calculadora / bancada técnica)
          4. Orçamentos (Prancheta / custos e propostas)
          ========================================================================= */}
      <section aria-label="Módulos principais" className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Cartão 1 — NOVO PROJETO */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_pop");
            setNewProjectOpen(true);
          }}
          className="caldra-card group relative flex min-h-[142px] flex-col justify-between rounded-2xl sm:rounded-3xl p-4 text-left transition-all duration-200 hover:border-red-500/40 active:scale-[0.98] cursor-pointer touch-manipulation sm:p-5"
        >
          <div className="flex items-start justify-between">
            {/* Ícone circular com acento vermelho CALDRA */}
            <div className="caldra-bubble-base caldra-bubble-red size-11 shadow-inner group-hover:scale-105 transition-transform duration-200">
              <Compass className="size-5.5" strokeWidth={1.75} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-3">
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground dark:text-white sm:text-base">
              Novo projeto
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-zinc-400 sm:text-xs">
              Desenhe e desenvolva
            </p>
          </div>
        </button>

        {/* Cartão 2 — PROJETOS */}
        <Link
          to="/projetos"
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_nav");
          }}
          className="caldra-card group relative flex min-h-[142px] flex-col justify-between rounded-2xl sm:rounded-3xl p-4 text-left transition-all duration-200 hover:border-sky-500/40 active:scale-[0.98] cursor-pointer touch-manipulation sm:p-5"
        >
          <div className="flex items-start justify-between">
            {/* Ícone circular com acento azul aço CAD */}
            <div className="caldra-bubble-base caldra-bubble-sky size-11 shadow-inner group-hover:scale-105 transition-transform duration-200">
              <Box className="size-5.5" strokeWidth={1.75} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-3">
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground dark:text-white sm:text-base">
              Projetos
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-zinc-400 sm:text-xs">
              CAD e criação
            </p>
          </div>
        </Link>

        {/* Cartão 3 — FERRAMENTAS */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_nav");
            setToolsOpen(true);
          }}
          className="caldra-card group relative flex min-h-[142px] flex-col justify-between rounded-2xl sm:rounded-3xl p-4 text-left transition-all duration-200 hover:border-amber-500/40 active:scale-[0.98] cursor-pointer touch-manipulation sm:p-5"
        >
          <div className="flex items-start justify-between">
            {/* Ícone circular com acento âmbar industrial */}
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shadow-inner group-hover:scale-105 transition-transform duration-200">
              <Calculator className="size-5.5" strokeWidth={1.75} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-3">
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground dark:text-white sm:text-base">
              Ferramentas
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-zinc-400 sm:text-xs">
              Calcule e resolva
            </p>
          </div>
        </button>

        {/* Cartão 4 — ORÇAMENTOS */}
        <Link
          to="/oficina"
          search={{ tab: "orcamento" }}
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_nav");
          }}
          className="caldra-card group relative flex min-h-[142px] flex-col justify-between rounded-2xl sm:rounded-3xl p-4 text-left transition-all duration-200 hover:border-emerald-500/40 active:scale-[0.98] cursor-pointer touch-manipulation sm:p-5"
        >
          <div className="flex items-start justify-between">
            {/* Ícone circular com acento verde esmeralda comercial */}
            <div className="caldra-bubble-base caldra-bubble-emerald size-11 shadow-inner group-hover:scale-105 transition-transform duration-200">
              <Receipt className="size-5.5" strokeWidth={1.75} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <div className="mt-3">
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground dark:text-white sm:text-base">
              Orçamentos
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-zinc-400 sm:text-xs">
              Calcule seus custos
            </p>
          </div>
        </Link>
      </section>

      {/* =========================================================================
          D. FAIXA DE ESPECIALIZAÇÃO
          - Banner horizontal largo
          - "Especialização — Caldeiraria e traçagem"
          - Ícone de conhecimento técnico com ilustração de redução cônica
          ========================================================================= */}
      <Link
        to="/escola"
        onClick={() => {
          triggerHaptic("selection");
          AudioManager.play("ui_nav");
        }}
        className="caldra-specialization group relative flex items-center justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-4.5 sm:p-5 shadow-lg transition-all duration-200 hover:border-amber-500/50 hover:shadow-amber-500/10 active:scale-[0.99] cursor-pointer touch-manipulation"
      >
        <div className="relative z-10 flex items-center gap-3.5 sm:gap-4">
          <div className="caldra-bubble-base caldra-bubble-indigo size-12 shadow-inner group-hover:scale-105 transition-transform duration-200 shrink-0">
            <GraduationCap className="size-6" strokeWidth={1.75} />
          </div>

          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-foreground dark:text-white sm:text-lg">
              Especialização
            </h2>
            <p className="text-xs text-muted-foreground dark:text-zinc-400 sm:text-sm">
              Caldeiraria e traçagem
            </p>
          </div>
        </div>

        {/* Ilustração geométrica da Redução Cônica à direita */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-16 w-24 sm:h-20 sm:w-32 opacity-90 transition-transform duration-300 group-hover:scale-105">
            <ConicalReductionGraphic className="size-full" />
          </div>
          <ChevronRight className="size-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
        </div>
      </Link>

      {/* =========================================================================
          E. PROJETOS RECENTES
          - Cabeçalho com indicador âmbar e link "Ver todos"
          - Lista de projetos reais armazenados pelo usuário
          - Estado vazio elegante quando ainda não houver projetos
          ========================================================================= */}
      <section aria-label="Projetos recentes" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full bg-amber-500" />
            <h2 className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-foreground/85 dark:text-zinc-300">
              PROJETOS RECENTES
            </h2>
          </div>

          <Link
            to="/projetos"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="group flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver todos
            <ChevronRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {recentProjects.length > 0 ? (
          <div className="space-y-2.5">
            {recentProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          /* Estado Vazio Elegante para novos usuários */
          <div className="caldra-card flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl p-6 text-center sm:p-8">
            <div className="caldra-bubble-base caldra-bubble-neutral size-12">
              <FolderKanban className="size-5" />
            </div>

            <h3 className="mt-3 font-display text-base font-semibold text-foreground dark:text-white">
              Seu próximo projeto começa aqui.
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Crie peças paramétricas, visualize em 3D, elabore desenhos CAD e gere documentação de fabricação.
            </p>

            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
                setNewProjectOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="size-3.5" /> Criar primeiro projeto
            </button>
          </div>
        )}

        {/* F. ATALHO COMPACTO DE CRIAÇÃO (Reutiliza o mesmo fluxo) */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_pop");
            setNewProjectOpen(true);
          }}
          className="caldra-card group flex w-full items-center justify-between rounded-2xl p-3.5 text-left transition-all duration-150 hover:border-amber-500/30 active:scale-[0.99] cursor-pointer touch-manipulation sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-neutral size-9 group-hover:border-amber-500/40 group-hover:text-amber-500 transition-colors">
              <Plus className="size-4.5" />
            </div>
            <div>
              <span className="block text-sm font-medium text-foreground dark:text-white group-hover:text-amber-500 transition-colors">
                Novo projeto
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Comece um novo trabalho
              </span>
            </div>
          </div>

          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>
      </section>

      {/* =========================================================================
          MODAIS E DIÁLOGOS INTEGRADOS
          ========================================================================= */}
      {/* Modal Real de Criação de Projeto */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />

      {/* Modal de Ferramentas e Bancada Técnica */}
      <TechnicalToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} />

      {/* Drawer de Notificações e Novidades Reais */}
      <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}

/** Componente de Cartão de Projeto Recente */
function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => {
        triggerHaptic("tap");
        AudioManager.play("ui_nav");
        void navigate({ to: "/projetos/$projectId", params: { projectId: project.id } });
      }}
      className="caldra-card group flex items-center justify-between gap-3.5 rounded-2xl p-3.5 transition-all duration-150 hover:border-amber-500/35 active:scale-[0.99] cursor-pointer touch-manipulation sm:p-4"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {/* Miniatura isométrica estilizada */}
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30 dark:bg-zinc-950/80 p-1.5 shadow-inner">
          <ConicalReductionGraphic className="size-full" />
        </div>

        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold text-foreground dark:text-white group-hover:text-amber-500 transition-colors">
            {project.name}
          </h3>

          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 truncate font-mono">
              <Folder className="size-3 text-muted-foreground/80 shrink-0" />
              {project.code || `Projeto #${project.id.slice(-4).toUpperCase()}`}
            </span>
            <span className="flex items-center gap-1 truncate">
              <Clock className="size-3 shrink-0" />
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </div>
  );
}

/** Bancada de Ferramentas Técnicas Integrada */
function TechnicalToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  if (!open) return null;

  const tools = [
    {
      title: "Calculadora Científica",
      desc: "Trigonometria, caldeiraria e conversões angulares",
      icon: Calculator,
      color: "caldra-bubble-amber text-amber-500",
      to: "/calculadora",
    },
    {
      title: "Traçagem Paramétrica",
      desc: "Modelos 3D, planificação zero fresta e traçagem passo a passo",
      icon: Compass,
      color: "caldra-bubble-sky text-sky-500",
      to: "/tracagem",
    },
    {
      title: "Prancheta CAD 2D CHAMFER",
      desc: "Desenho vetorial técnico, cotas e exportação DXF",
      icon: PenTool,
      color: "caldra-bubble-red text-red-500",
      to: "/desenho-2d",
    },
    {
      title: "Bancada de Chapas e Nesting",
      desc: "Aproveitamento de retalho e plano de corte na chapa",
      icon: Layers,
      color: "caldra-bubble-emerald text-emerald-500",
      to: "/oficina",
      search: { tab: "chapa" },
    },
    {
      title: "Tarifas de Máquina e Custos",
      desc: "Cálculo de corte por metro, perfuração e dobra",
      icon: TrendingUp,
      color: "caldra-bubble-indigo text-indigo-500",
      to: "/oficina",
      search: { tab: "custo" },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,500px)] overflow-y-auto border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <Wrench className="size-4.5" />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Bancada de Ferramentas
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Ferramentas técnicas operacionais de cálculo, traçado e oficina metálica.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-2">
          {tools.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                onClose();
                if (t.search) {
                  void navigate({ to: t.to, search: t.search });
                } else {
                  void navigate({ to: t.to });
                }
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 text-left transition-all hover:border-border hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className={cn("caldra-bubble-base size-10 shrink-0", t.color)}>
                  <t.icon className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Drawer de Notificações e Novidades Reais */
function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,500px)] overflow-y-auto border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-accent">
              <Bell className="size-4.5" />
              <DialogTitle className="font-display text-lg font-bold text-foreground">
                Novidades e Atualizações
              </DialogTitle>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Acompanhe as melhorias da sua oficina digital CALDRA.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {CHANGELOG.slice(0, 4).map((entry) => (
            <div key={entry.version} className="rounded-2xl border border-border/60 bg-muted/30 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-500" />
                  {entry.title}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  v{entry.version} · {entry.date}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground pt-1">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500/80">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
