import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { MasterModeDialog } from "./MasterModeDialog";
import { BubbleNav } from "./BubbleNav";
import { MainTabsKeepAlive, MAIN_TAB_PATHS } from "./MainTabsKeepAlive";
import { Intro, useIntro } from "./Intro";
import { Onboarding } from "./Onboarding";
import { ProfileDialog } from "./Profile";
import { PaywallDialog } from "./Paywall";
import { AuroraBackground } from "./Aurora";
import { ShellActionsProvider } from "./ShellActions";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { UnifiedQuickActionsBar } from "./UnifiedQuickActionsBar";
import { CaldraGenesisPreIntro } from "@/components/caldra/CaldraGenesisPreIntro";

/** Fundo AURORA ativo em todas as telas não-imersivas (Home, Chamfer Lobby, Projetar, Produzir, Aprenda, Perfil, etc.) */
function auroraVisible(pathname: string) {
  return !immersiveRoute(pathname);
}

/** Editor CHAMFER aberto: tela cheia imersiva, sem navegação global. */
function immersiveRoute(pathname: string) {
  return /^\/desenho-2d\/[^/]+/.test(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [masterOpen, setMasterOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const { closeGate } = useFeatureAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const intro = useIntro();
  const profile = useProfile();

  // Executa na abertura do aplicativo por exatamente 5,000 segundos
  const [startupGenesis, setStartupGenesis] = useState(false);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("autostart") === "1") {
        setAutostart(true);
        setStartupGenesis(false);
        window.sessionStorage.setItem("caldra.genesis_session_done", "1");
        window.sessionStorage.setItem("caldra.intro.v2", "done");
        return;
      }
      if (sp.has("genesis") || sp.has("abertura") || sp.has("preintro")) {
        setStartupGenesis(true);
        return;
      }
      if (!window.sessionStorage.getItem("caldra.genesis_session_done")) {
        setStartupGenesis(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handleReopen = () => setStartupGenesis(true);
    window.addEventListener("caldra:open-preintro", handleReopen);
    return () => window.removeEventListener("caldra:open-preintro", handleReopen);
  }, []);

  const showOnboarding =
    profile.ready && !intro.show && !profile.onboarded && !startupGenesis && !autostart;
  const editorPath = immersiveRoute(pathname);
  const immersive = editorPath;
  const standalone = pathname.startsWith("/calculadora");
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isMainTab = MAIN_TAB_PATHS.includes(normalizedPath as any);

  /* A troca de rota encerra o gate antes de o editor montar. Assim, o portal,
     o bloqueio de scroll e o backdrop nunca sobrevivem dentro do CHAMFER. */
  useEffect(() => {
    if (editorPath) closeGate();
  }, [closeGate, editorPath]);

  return (
    <ShellActionsProvider
      value={{
        openProfile: () => {
          triggerHaptic("tap");
          AudioManager.play("ui_nav");
          void navigate({ to: "/perfil" });
        },
        openMaster: () => setMasterOpen(true),
      }}
    >
      <div className="relative flex min-h-screen flex-col overflow-x-hidden text-foreground bg-background">
        <AuroraBackground active={auroraVisible(pathname)} className="fixed inset-0 z-0" />

        {!immersive && !standalone && (
          <div className="fixed top-3 right-4 z-40">
            <UnifiedQuickActionsBar />
          </div>
        )}

        <main
          className={cn(
            "relative z-10 min-w-0 flex-1",
            immersive || standalone
              ? "p-0"
              : isMainTab ||
                  pathname === "/desenho-2d" ||
                  pathname === "/desenho-2d/" ||
                  pathname === "/configuracoes"
                ? "p-0"
                : "px-4 pt-16 pb-28 lg:px-10 lg:pt-16 lg:pb-24",
          )}
        >
          <div
            className={cn(
              immersive ||
                standalone ||
                isMainTab ||
                pathname === "/desenho-2d" ||
                pathname === "/desenho-2d/" ||
                pathname === "/configuracoes"
                ? "w-full"
                : "mx-auto w-full max-w-6xl",
            )}
          >
            {/* Camada viva em memória (Keep-Alive) das 5 abas principais — zero unmount */}
            <MainTabsKeepAlive activePath={normalizedPath} isVisible={isMainTab} />
            {/* Rotas secundárias e imersivas renderizadas via Outlet */}
            {!isMainTab && children}
          </div>
        </main>

        {!immersive && !standalone && <BubbleNav />}
        <MasterModeDialog open={masterOpen} onOpenChange={setMasterOpen} />
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
        <PaywallDialog />
        {intro.show && !startupGenesis && !autostart && <Intro onDone={intro.done} />}
        {showOnboarding && <Onboarding />}
        {startupGenesis && (
          <CaldraGenesisPreIntro
            onComplete={() => {
              setStartupGenesis(false);
              try {
                window.sessionStorage.setItem("caldra.genesis_session_done", "1");
              } catch {
                /* ignore */
              }
            }}
          />
        )}
      </div>
    </ShellActionsProvider>
  );
}
