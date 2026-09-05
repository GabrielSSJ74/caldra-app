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
import { AppShell } from "@/components/chameleon/AppShell";

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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CALDRA — Traçado e Planificação Zero Fresta" },
      {
        name: "description",
        content:
          "Traçagem, planificação, projetos e conhecimento para caldeiraria. Transforme medidas em fabricação.",
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
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** Tema aplicado SINCRONAMENTE antes do primeiro paint — sem flash. */
const THEME_BOOT = `(function(){try{
var s=JSON.parse(localStorage.getItem("caldra.settings")||"{}");
var t=s.theme||"dark";var a=s.accent||"amber";var r=document.documentElement;
var prefersDark=!window.matchMedia||window.matchMedia("(prefers-color-scheme: dark)").matches;
var dark=t==="dark"||t==="amoled"||(t==="system"&&prefersDark);
r.classList.toggle("dark",dark);r.classList.toggle("amoled",t==="amoled");
r.classList.toggle("accent-blue",a==="blue");r.classList.toggle("accent-magenta",a==="magenta");
}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <SettingsProvider>
            <ProfileProvider>
              <MaterialsProvider>
                <AppShell>
                  <Outlet />
                </AppShell>
                <Toaster position="top-center" />
              </MaterialsProvider>
            </ProfileProvider>
          </SettingsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
