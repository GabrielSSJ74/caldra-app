import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass, PenTool, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraBackground } from "./Aurora";

const KEY = "caldra.intro.v1";

const SLIDES = [
  {
    icon: Compass,
    title: "Traçagem exata",
    text: "Geometria real, sem gambiarra. Cada peça calculada por triangulação verdadeira.",
  },
  {
    icon: PenTool,
    title: "Planificação zero fresta",
    text: "Do modelo 3D ao CHAMFER, pronto para corte, em milímetros.",
  },
  {
    icon: Sigma,
    title: "Estudo aplicado",
    text: "Fórmulas, aulas e projetos no mesmo lugar — do cálculo à fabricação.",
  },
];

/** Abertura animada do CALDRA + apresentação em três abas deslizáveis. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"logo" | "slides">("logo");
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("slides"), 2600);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    setLeaving(true);
    window.setTimeout(onDone, 420);
  };

  const next = () => (step < SLIDES.length - 1 ? setStep(step + 1) : finish());

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col bg-background transition-opacity duration-400",
        leaving ? "opacity-0" : "opacity-100",
      )}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        if (start - end > 60) next();
        if (end - start > 60 && step > 0) setStep(step - 1);
      }}
    >
      <AuroraBackground />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 size-[26rem] -translate-x-1/2 rounded-full blur-[130px]"
        style={{ background: "color-mix(in oklab, var(--holo) 14%, transparent)" }}
      />

      {phase === "logo" ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5">
          <svg viewBox="0 0 120 120" className="size-32" aria-hidden>
            <g
              fill="none"
              stroke="var(--holo)"
              strokeWidth="1.4"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 340,
                animation: "caldra-draw 1.6s cubic-bezier(.22,1,.36,1) both",
                filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--holo) 55%, transparent))",
              }}
            >
              <path d="M60 12 108 60 60 108 12 60Z" />
              <path d="M60 30 90 60 60 90 30 60Z" opacity=".8" />
              <path d="M60 48 72 60 60 72 48 60Z" opacity=".6" />
            </g>
          </svg>
          <h1
            className="font-display text-4xl font-semibold"
            style={{ animation: "caldra-rise 1s .9s cubic-bezier(.22,1,.36,1) both" }}
          >
            CALDRA
          </h1>
        </div>
      ) : (
        <>
          <div className="relative z-10 flex flex-1 items-center overflow-hidden">
            <div
              className="flex w-full transition-transform duration-500 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
              style={{ transform: `translateX(-${step * 100}%)` }}
            >
              {SLIDES.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="w-full shrink-0 px-8">
                    <div className="mx-auto max-w-sm">
                      <span
                        className="grid size-14 place-items-center rounded-2xl"
                        style={{
                          background: "color-mix(in oklab, var(--holo) 12%, transparent)",
                          color: "var(--holo)",
                        }}
                      >
                        <Icon className="size-6" strokeWidth={1.4} />
                      </span>
                      <h2 className="mt-6 font-display text-3xl leading-tight font-semibold">
                        {s.title}
                      </h2>
                      <p className="mt-3 text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between px-8 pb-10">
            <div className="flex items-center gap-2">
              {SLIDES.map((s, i) => (
                <span
                  key={s.title}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-accent" : "w-1.5 bg-border",
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={finish}
                className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase"
              >
                Pular
              </button>
              <button
                onClick={next}
                className="brand-gradient flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-background"
              >
                {step < SLIDES.length - 1 ? "Próximo" : "Começar"}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function useIntro() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!window.sessionStorage.getItem(KEY)) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);
  const done = () => {
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return { show, done };
}
