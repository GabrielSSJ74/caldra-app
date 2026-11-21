import React, { useState, useEffect, memo } from "react";
import { WorkshopDashboard } from "@/components/home/WorkshopDashboard";
import { ProjetarPage } from "@/routes/projetar";
import { ProduzirPage } from "@/routes/produzir";
import { AprendaPage } from "@/routes/aprenda";
import { PerfilRouteComponent } from "@/routes/perfil";

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

  return (
    <div
      id="caldra-main-tabs-keepalive"
      aria-hidden={!isVisible}
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
          <ProjetarPage />
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
          <ProduzirPage />
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
          <AprendaPage />
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
          <PerfilRouteComponent />
        </div>
      )}
    </div>
  );
});
