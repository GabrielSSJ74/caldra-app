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
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const effectivePath = optimisticPath ?? activePath;

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

  // Sincroniza estado otimista quando o roteador confirma o pathname
  useEffect(() => {
    setOptimisticPath(null);
  }, [activePath]);

  // Escuta evento imediato disparado pelo clique/toque na barra inferior (0ms de atraso)
  useEffect(() => {
    const onImmediateTabSwitch = (event: Event) => {
      const targetPath = (event as CustomEvent<string>).detail;
      if (typeof targetPath === "string" && MAIN_TAB_PATHS.includes(targetPath as MainTabPath)) {
        setMountedTabs((prev) => {
          if (prev.has(targetPath)) return prev;
          const next = new Set(prev);
          next.add(targetPath);
          return next;
        });
        setOptimisticPath(targetPath);
      }
    };
    window.addEventListener("caldra:tab-switch", onImmediateTabSwitch);
    return () => {
      window.removeEventListener("caldra:tab-switch", onImmediateTabSwitch);
    };
  }, []);

  // Registra abas em memória conforme são visitadas e nunca as desmonta (Keep-Alive)
  useEffect(() => {
    if (MAIN_TAB_PATHS.includes(effectivePath as MainTabPath)) {
      setMountedTabs((prev) => {
        if (prev.has(effectivePath)) return prev;
        const next = new Set(prev);
        next.add(effectivePath);
        return next;
      });
    }
  }, [effectivePath]);

  const isHomeActive = isVisible && effectivePath === "/";

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
          data-active={effectivePath === "/"}
          data-visible={isHomeActive ? "true" : "false"}
          className="caldra-tab-layer"
          style={{
            display: effectivePath === "/" ? "block" : "none",
          }}
        >
          <WorkshopDashboard />
        </div>
      )}

      {/* 2. ABA PROJETAR */}
      {mountedTabs.has("/projetar") && (
        <div
          id="tab-layer-projetar"
          data-active={effectivePath === "/projetar"}
          className="caldra-tab-layer"
          style={{
            display: effectivePath === "/projetar" ? "block" : "none",
          }}
        >
          <ProjetarPage />
        </div>
      )}

      {/* 3. ABA PRODUZIR */}
      {mountedTabs.has("/produzir") && (
        <div
          id="tab-layer-produzir"
          data-active={effectivePath === "/produzir"}
          className="caldra-tab-layer"
          style={{
            display: effectivePath === "/produzir" ? "block" : "none",
          }}
        >
          <ProduzirPage />
        </div>
      )}

      {/* 4. ABA APRENDA */}
      {mountedTabs.has("/aprenda") && (
        <div
          id="tab-layer-aprenda"
          data-active={effectivePath === "/aprenda"}
          className="caldra-tab-layer"
          style={{
            display: effectivePath === "/aprenda" ? "block" : "none",
          }}
        >
          <AprendaPage />
        </div>
      )}

      {/* 5. ABA PERFIL */}
      {mountedTabs.has("/perfil") && (
        <div
          id="tab-layer-perfil"
          data-active={effectivePath === "/perfil"}
          className="caldra-tab-layer"
          style={{
            display: effectivePath === "/perfil" ? "block" : "none",
          }}
        >
          <PerfilRouteComponent />
        </div>
      )}
    </div>
  );
});

