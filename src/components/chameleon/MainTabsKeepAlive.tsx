import React, { useState, useEffect, memo, lazy, Suspense } from "react";
import { WorkshopDashboard } from "@/components/home/WorkshopDashboard";

const ProjetarPage = lazy(() =>
  import("@/routes/projetar").then((m) => ({ default: m.ProjetarPage })),
);
const ProduzirPage = lazy(() =>
  import("@/routes/produzir").then((m) => ({ default: m.ProduzirPage })),
);
const AprendaPage = lazy(() =>
  import("@/routes/aprenda").then((m) => ({ default: m.AprendaPage })),
);
const PerfilRouteComponent = lazy(() =>
  import("@/routes/perfil").then((m) => ({ default: m.PerfilRouteComponent })),
);

export const MAIN_TAB_PATHS = ["/", "/projetar", "/produzir", "/aprenda", "/perfil"] as const;
export type MainTabPath = (typeof MAIN_TAB_PATHS)[number];

interface MainTabsKeepAliveProps {
  activePath: string;
  isVisible: boolean;
}

export const MainTabsKeepAlive = memo(function MainTabsKeepAlive({
  activePath,
  isVisible,
}: MainTabsKeepAliveProps) {
  // Inicializa montando somente a aba atualmente requisitada (carregamento leve sob demanda)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (MAIN_TAB_PATHS.includes(activePath as MainTabPath)) {
      initial.add(activePath);
    } else {
      initial.add("/");
    }
    return initial;
  });

  // Registra abas em memória conforme são visitadas e nunca as desmonta (Keep-Alive)
  useEffect(() => {
    if (MAIN_TAB_PATHS.includes(activePath as MainTabPath)) {
      setMountedTabs((prev) => {
        if (prev.has(activePath)) return prev;
        const next = new Set(prev);
        next.add(activePath);
        return next;
      });
    }
  }, [activePath]);

  const isHomeActive = isVisible && activePath === "/";

  return (
    <div
      id="caldra-main-tabs-keepalive"
      aria-hidden={!isVisible}
      data-visible={isVisible ? "true" : "false"}
      style={{
        display: isVisible ? "block" : "none",
        width: "100%",
        minHeight: "100%",
      }}
    >
      {/* 1. ABA INÍCIO */}
      {mountedTabs.has("/") && (
        <div
          id="tab-layer-inicio"
          data-active={activePath === "/"}
          data-visible={isHomeActive ? "true" : "false"}
          className="caldra-tab-layer"
          style={{
            display: activePath === "/" ? "block" : "none",
          }}
        >
          <WorkshopDashboard />
        </div>
      )}

      {/* 2. ABA PROJETAR */}
      {mountedTabs.has("/projetar") && (
        <div
          id="tab-layer-projetar"
          data-active={activePath === "/projetar"}
          className="caldra-tab-layer"
          style={{
            display: activePath === "/projetar" ? "block" : "none",
          }}
        >
          <Suspense fallback={null}>
            <ProjetarPage />
          </Suspense>
        </div>
      )}

      {/* 3. ABA PRODUZIR */}
      {mountedTabs.has("/produzir") && (
        <div
          id="tab-layer-produzir"
          data-active={activePath === "/produzir"}
          className="caldra-tab-layer"
          style={{
            display: activePath === "/produzir" ? "block" : "none",
          }}
        >
          <Suspense fallback={null}>
            <ProduzirPage />
          </Suspense>
        </div>
      )}

      {/* 4. ABA APRENDA */}
      {mountedTabs.has("/aprenda") && (
        <div
          id="tab-layer-aprenda"
          data-active={activePath === "/aprenda"}
          className="caldra-tab-layer"
          style={{
            display: activePath === "/aprenda" ? "block" : "none",
          }}
        >
          <Suspense fallback={null}>
            <AprendaPage />
          </Suspense>
        </div>
      )}

      {/* 5. ABA PERFIL */}
      {mountedTabs.has("/perfil") && (
        <div
          id="tab-layer-perfil"
          data-active={activePath === "/perfil"}
          className="caldra-tab-layer"
          style={{
            display: activePath === "/perfil" ? "block" : "none",
          }}
        >
          <Suspense fallback={null}>
            <PerfilRouteComponent />
          </Suspense>
        </div>
      )}
    </div>
  );
});
