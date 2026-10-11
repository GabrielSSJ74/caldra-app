import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  User,
  ShieldCheck,
  Sparkles,
  Settings,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Check,
  Languages,
  Sliders,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { PLAN_LABEL } from "@/lib/subscription/features";
import { useSettings, type ThemeMode } from "@/lib/settings/SettingsProvider";
import { Avatar } from "@/components/chameleon/Profile";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil e Conta — CALDRA" },
      {
        name: "description",
        content:
          "Gerenciamento de perfil, conta, plano CALDRA Pro, preferências de tema e configurações do aplicativo.",
      },
      { property: "og:title", content: "Perfil e Conta — CALDRA" },
      {
        property: "og:description",
        content: "Dados do profissional, plano, preferências e gerenciamento da conta.",
      },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const profile = useProfile();
  const { user, ready, signOut } = useAuth();
  const { plan } = useFeatureAccess();
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    language,
    setLanguage,
    cardOpacity,
    setCardOpacity,
    precision,
    setPrecision,
  } = useSettings();

  return (
    <div className="space-y-4 pb-28 pt-1">
      {/* Cabeçalho da Área */}
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            USUÁRIO & AJUSTES
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Perfil e Conta
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Informações profissionais, acesso à conta, assinatura e preferências do sistema.
        </p>
      </header>

      {/* =========================================================================
          1. PERFIL (Ordem Visual: 1)
          - Informações do perfil do usuário
          - Foto/Avatar, nome, identificação profissional
          ========================================================================= */}
      <section aria-labelledby="section-perfil-info" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-sky size-11 shadow-inner shrink-0">
              <User className="size-5.5 text-sky-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-sky-500">01</span>
                <h2 id="section-perfil-info" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Perfil
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Identificação do caldeireiro e profissional técnico.
              </p>
            </div>
          </div>
        </div>

        {/* Card com dados do perfil */}
        <div className="mt-3.5 flex items-center gap-3.5 rounded-xl border border-border/60 bg-muted/20 p-3">
          <Avatar photo={profile.photo} size={48} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm sm:text-base font-bold text-foreground truncate">
              {profile.name || "Caldeireiro Profissional"}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {profile.role || "Especialista em Caldeiraria e Traçagem"}
            </p>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500" />
              <span>Nível Técnico: Avançado</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. CONTA (Ordem Visual: 2)
          - Gerenciamento da conta
          - Recursos de sessão, identificação e sincronização
          ========================================================================= */}
      <section aria-labelledby="section-conta" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-emerald size-11 shadow-inner shrink-0">
              <ShieldCheck className="size-5.5 text-emerald-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-emerald-500">02</span>
                <h2 id="section-conta" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Conta
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Sessão segura, dados sincronizados e acesso ao ecossistema.
              </p>
            </div>
          </div>

          <Link
            to="/conta"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all"
          >
            <span>Gerenciar</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-3.5 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[10px] uppercase text-muted-foreground block">
                Status de Autenticação
              </span>
              <p className="font-mono text-xs font-semibold text-foreground mt-0.5">
                {user ? user.email : "Sessão Local / Modo Convidado"}
              </p>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  void signOut();
                }}
                className="inline-flex items-center gap-1 font-mono text-xs text-destructive hover:underline cursor-pointer"
              >
                <LogOut className="size-3.5" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. CALDRA PRO (Ordem Visual: 3)
          - Informações do plano atual
          - Recursos de assinatura e opções disponíveis
          ========================================================================= */}
      <section aria-labelledby="section-pro" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-amber size-11 shadow-inner shrink-0">
              <Sparkles className="size-5.5 text-amber-500" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-amber-500">03</span>
                <h2 id="section-pro" className="font-display text-base font-bold text-foreground sm:text-lg">
                  CALDRA Pro
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Planos, recursos ilimitados, exportação DXF e projetos avançados.
              </p>
            </div>
          </div>

          <Link
            to="/pro"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            <span>Ver planos</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-3.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[9px] uppercase text-amber-500 font-semibold block">
                Plano Vigente
              </span>
              <p className="font-display text-sm font-bold text-foreground mt-0.5">
                {PLAN_LABEL[plan] || "CALDRA Free"}
              </p>
            </div>
            <Link
              to="/pro"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 font-mono text-xs font-bold text-zinc-950 shadow-sm hover:bg-amber-400 active:scale-95 transition-all"
            >
              <span>{plan === "pro" ? "Gerenciar" : "Fazer Upgrade"}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CONFIGURAÇÕES (Ordem Visual: 4)
          - Tema (Claro, Escuro, AMOLED)
          - Preferências de idioma e interface
          - Transparência e precisão decimal
          ========================================================================= */}
      <section aria-labelledby="section-config" className="caldra-card rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="caldra-bubble-base caldra-bubble-neutral size-11 shadow-inner shrink-0">
              <Settings className="size-5.5 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-muted-foreground">04</span>
                <h2 id="section-config" className="font-display text-base font-bold text-foreground sm:text-lg">
                  Configurações
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Tema de cores, transparência, idioma e preferências do aplicativo.
              </p>
            </div>
          </div>

          <Link
            to="/configuracoes"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <span>Avançadas</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Seleção rápida de Tema */}
        <div className="mt-3.5 space-y-3">
          <div>
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Tema Visual
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "light", label: "Claro", icon: Sun },
                  { id: "dark", label: "Escuro", icon: Moon },
                  { id: "amoled", label: "AMOLED", icon: Monitor },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setTheme(t.id);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-mono transition-all cursor-pointer",
                    theme === t.id
                      ? "border-amber-500 bg-amber-500/15 text-amber-500 font-bold"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <t.icon className="size-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seleção de Idioma */}
          <div>
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Idioma do Aplicativo
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "pt-BR", label: "Português" },
                  { id: "en", label: "English" },
                  { id: "es", label: "Español" },
                ] as const
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setLanguage(lang.id);
                  }}
                  className={cn(
                    "flex items-center justify-center rounded-xl border p-2 text-xs font-mono transition-all cursor-pointer",
                    language === lang.id
                      ? "border-amber-500 bg-amber-500/15 text-amber-500 font-bold"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
