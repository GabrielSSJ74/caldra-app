import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useProfile } from "@/lib/profile/ProfileProvider";
import { MasterModeDialog } from "./MasterModeDialog";
import { BubbleNav } from "./BubbleNav";
import { Intro, useIntro } from "./Intro";
import { Onboarding } from "./Onboarding";
import { Avatar, ProfileDialog } from "./Profile";
import { PaywallDialog } from "./Paywall";
import { AuroraBackground } from "./Aurora";

/** Rotas com fundo AURORA. O editor CHAMFER (desenho-2d) nunca entra aqui. */
const AURORA_ROUTES = ["/", "/tracagem", "/escola", "/projetos", "/oficina", "/configuracoes"];

function auroraVisible(pathname: string) {
  return AURORA_ROUTES.some((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r)));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [masterOpen, setMasterOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { isMestre } = useFeatureAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const intro = useIntro();
  const profile = useProfile();
  const showOnboarding = profile.ready && !intro.show && !profile.onboarded;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <AuroraBackground active={auroraVisible(pathname)} className="fixed -z-10" />
      {/* iluminação ambiente */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 -left-32 size-[26rem] rounded-full bg-accent/8 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 size-[26rem] rounded-full bg-accent2/8 blur-[120px]" />
        {isMestre && (
          <div className="absolute top-1/3 left-1/2 size-[22rem] -translate-x-1/2 rounded-full bg-accent/6 blur-[140px]" />
        )}
      </div>

      <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
        <button
          onClick={() => setMasterOpen(true)}
          aria-label={isMestre ? "Modo Mestre ativo" : "Ativar Modo Mestre"}
          className={cn(
            "grid size-9 place-items-center rounded-full transition-all duration-300",
            "metal backdrop-blur-xl hover:scale-110",
            isMestre ? "text-accent glow-ring" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Sparkles className="size-4" />
        </button>
        <button
          onClick={() => setProfileOpen(true)}
          aria-label="Abrir perfil"
          className="rounded-full transition-transform duration-300 hover:scale-110"
        >
          <Avatar photo={profile.photo} size={36} className="backdrop-blur-xl" />
        </button>
      </div>


      <main
        className="fade-up relative z-10 min-w-0 flex-1 px-4 pt-16 pb-28 lg:px-10 lg:pt-16 lg:pb-24"
      >

        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      <BubbleNav />
      <MasterModeDialog open={masterOpen} onOpenChange={setMasterOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <PaywallDialog />
      {intro.show && <Intro onDone={intro.done} />}
      {showOnboarding && <Onboarding />}
    </div>
  );
}
