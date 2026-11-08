import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { SubscriptionProvider } from "@/lib/subscription/SubscriptionProvider";
import { SettingsProvider } from "@/lib/settings/SettingsProvider";
import { ProfileProvider } from "@/lib/profile/ProfileProvider";
import { MaterialsProvider } from "@/lib/materials/MaterialsProvider";
import { AudioProvider } from "@/lib/audio/AudioProvider";
import { AIProcessingProvider } from "@/lib/ai/aiProcessingContext";
import { AppShell } from "@/components/chameleon/AppShell";
import {
  CORE_ROUTES,
  measureFirstInteraction,
  onIdle,
  prefetchAllowed,
} from "@/lib/perf/firstInteraction";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O recurso solicitado não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="brand-gradient inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-background"
          >
            Voltar ao Laboratório
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo falhou no processamento. Tente novamente ou volte ao Laboratório.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

/** Tema aplicado SINCRONAMENTE antes do primeiro paint — sem flash. Padrão inicial: Claro ('light') e Azul ('blue' / '#0066FF'). */
const THEME_BOOT = `(function(){try{
var tm=localStorage.getItem("caldra_theme_mode");
var ac=localStorage.getItem("caldra_accent_color");
var oa=localStorage.getItem("caldra_orbs_use_accent");
var s=JSON.parse(localStorage.getItem("caldra.settings")||"{}");
var t=tm||s.theme||"light";
var a=ac||s.accent||"blue";
if(a==="#0066FF"||a==="#0066ff"||a==="#007AFF"||a==="#00CCFF"||a==="#003471"||a==="#00A8FF"||a==="#2CA5D6")a="blue";
if(a==="#F59E0B"||a==="#f59e0b"||a==="#D16002"||a==="#8A3300"||a==="#F7941D")a="amber";
if(a==="#B22222"||a==="#b22222"||a==="#D61818"||a==="#E51A4C"||a==="#C11034"||a==="magenta")a="crimson";
var r=document.documentElement;
var prefersDark=!window.matchMedia||window.matchMedia("(prefers-color-scheme: dark)").matches;
var dark=t==="dark"||t==="amoled"||(t==="system"&&prefersDark);
var resolved=t==="amoled"?"amoled":dark?"dark":"light";
r.dataset.theme=resolved;
r.style.colorScheme=dark?"dark":"light";
r.classList.toggle("dark",dark);r.classList.toggle("amoled",t==="amoled");
r.classList.toggle("accent-default",a==="default");r.classList.toggle("accent-blue",a==="blue");r.classList.toggle("accent-amber",a==="amber");
var isCrimson=a==="crimson";
r.classList.toggle("accent-crimson",isCrimson);r.classList.toggle("accent-magenta",isCrimson);
var useOrbsAccent=oa==="true"||oa==="1"||s.useAccentInOrbs===true;
r.dataset.orbsAccent=useOrbsAccent?"true":"false";
var co=typeof s.cardOpacity==="number"?Math.min(100,Math.max(20,s.cardOpacity)):90;
var bo=typeof s.bubbleOpacity==="number"?Math.min(100,Math.max(20,s.bubbleOpacity)):35;
var uiOp=(co/100).toFixed(2);
var bFill=(0.10+((bo-20)/80)*0.28).toFixed(3);
var bBorder=Math.min(0.62,Number(bFill)*1.35+0.12).toFixed(3);
r.style.setProperty("--card-opacity",uiOp);
r.style.setProperty("--bubble-opacity",(bo/100).toFixed(2));
r.style.setProperty("--bubble-tint-alpha",bFill);
r.style.setProperty("--bubble-border-alpha",bBorder);
r.style.setProperty("--ui-opacity",uiOp);
r.setAttribute("data-bg-style",s.auroraStyle||"padrao");
r.lang=s.language==="en"?"en":s.language==="es"?"es":"pt-BR";
if(location.search.indexOf("autostart=1")!==-1||sessionStorage.getItem("caldra.genesis_session_done")==="1"){r.classList.add("boot-done");}
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute("content",resolved==="light"?"#EAEEF3":resolved==="amoled"?"#000000":"#0B0D11");
}catch(e){}})();`;

/** Splash de abertura: pinta o fundo escuro técnico (#030712) antes do JS e entrega sem flash para a animação CAD 3D. */
const BOOT_SPLASH_STYLE = `
@keyframes caldraBootAutoHide{to{opacity:0;pointer-events:none}}
#caldra-boot{position:fixed;inset:0;z-index:9999;background:#030712;transition:opacity .25s ease;animation:caldraBootAutoHide .25s ease 1.5s forwards}
#caldra-boot.done,.boot-done #caldra-boot{opacity:0;pointer-events:none;display:none}
`;
const BOOT_SPLASH_HTML = ``;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CALDRA - Metal Lab Suite" },
      {
        name: "description",
        content:
          "Traçagem, planificação, cálculo técnico e projetos paramétricos para caldeiraria industrial.",
      },
      { property: "og:title", content: "CALDRA - Metal Lab Suite" },
      {
        property: "og:description",
        content:
          "Traçagem, planificação, cálculo técnico e projetos paramétricos para caldeiraria industrial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
    scripts: [
      {
        children: THEME_BOOT,
      },
    ],
    styles: [
      {
        children: BOOT_SPLASH_STYLE,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="accent-blue bg-background" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-screen overflow-x-hidden m-0 p-0" suppressHydrationWarning>
        <div id="caldra-boot" dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_HTML }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Cold start: remove o splash assim que o app monta.
  useEffect(() => {
    const el = document.getElementById("caldra-boot");
    if (!el) return;
    el.classList.add("done");
    const t = window.setTimeout(() => el.remove(), 420);
    return () => window.clearTimeout(t);
  }, []);

  // Medição de latência da primeira interação (somente desenvolvimento).
  useEffect(() => measureFirstInteraction(), []);

  /* Prefetch das telas de navegação essencial, UMA de cada vez, só com o
     navegador ocioso e nunca durante uma navegação — para não disputar a
     linha principal justamente quando o usuário toca em algo.
     Fica fora do modo de desenvolvimento: ali cada tela é servida em
     centenas de arquivos soltos e o prefetch atrapalharia em vez de ajudar
     (no aplicativo publicado cada tela é um único pacote). */
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!prefetchAllowed()) return;

    let cancelled = false;
    let cancel: () => void = () => {};
    const queue = [...CORE_ROUTES];
    const step = () => {
      if (cancelled) return;
      /* Navegação em curso: o toque do usuário tem prioridade absoluta. */
      if (router.state.isLoading || router.state.isTransitioning) {
        cancel = onIdle(step, 4000);
        return;
      }
      const to = queue.shift();
      if (!to) return;
      void Promise.resolve(router.preloadRoute({ to }))
        .catch(() => {})
        .finally(() => {
          if (!cancelled) cancel = onIdle(step, 4000);
        });
    };
    cancel = onIdle(step, 4000);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <SettingsProvider>
            <ProfileProvider>
              <MaterialsProvider>
                <AudioProvider>
                  <AIProcessingProvider>
                    <AppShell>
                      <Outlet />
                    </AppShell>
                    <Toaster position="top-center" />
                  </AIProcessingProvider>
                </AudioProvider>
              </MaterialsProvider>
            </ProfileProvider>
          </SettingsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
