import { useSettings } from "@/lib/settings/SettingsProvider";
import { cn } from "@/lib/utils";

interface AuroraLiquidShaderProps {
  active?: boolean;
  className?: string;
}

/**
 * Camada atmosférica fluida sutil para o modo Aurora "fluido" do AppShell.
 */
export function AuroraLiquidShader({ active = true, className }: AuroraLiquidShaderProps) {
  const { auroraStyle, resolvedTheme, theme } = useSettings();
  if (!active || auroraStyle !== "fluido") return null;

  const isLight = resolvedTheme === "light";
  const isAmoled = theme === "amoled";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700",
        isLight ? "opacity-35" : isAmoled ? "opacity-45" : "opacity-60",
        className,
      )}
    >
      <div
        className="absolute -top-32 left-1/4 h-[380px] w-[380px] rounded-full blur-[110px]"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.16) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-0 right-1/5 h-[340px] w-[340px] rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--accent) / 0.12) 0%, transparent 72%)",
        }}
      />
    </div>
  );
}
