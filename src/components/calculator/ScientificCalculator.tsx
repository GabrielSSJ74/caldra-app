import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  Delete,
  Beaker,
  ChevronDown,
  Divide,
  Equal,
  History,
  Settings,
  Volume2,
  VolumeX,
  X,
  Copy,
  Check,
  Ruler,
  Scale,
  Compass,
  Pi,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  decimalToDMS,
  dmsToDecimal,
  evaluateExpression,
  formatResult,
  mmToCommercialInchFraction,
  toFraction,
  type AngleMode,
} from "@/lib/calculator/engine";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveAccentColorTokens } from "@/lib/settings/appearancePreferences";

const HISTORY_KEY = "caldra.calculator.history";
const PREFS_KEY = "caldra.calculator.preferences";
type HistoryItem = { expression: string; result: string; value: number; at: number };
type DrawerTab = "padrao" | "conversao" | "peso" | "angulos" | "constantes";

const keyClass = "calc-key min-w-0 active:scale-[0.97]";

const MATERIALS = [
  { id: "aco_carbono", name: "Aço Carbono (SAE 1020/A36)", density: 7.85 },
  { id: "inox_304", name: "Aço Inox 304 / 316", density: 7.93 },
  { id: "aluminio", name: "Alumínio Naval (5052/6061)", density: 2.7 },
  { id: "galvanizado", name: "Aço Galvanizado (Z275)", density: 7.87 },
  { id: "cobre", name: "Cobre Eletrolítico", density: 8.96 },
  { id: "latao", name: "Latão Industrial", density: 8.5 },
] as const;

const INDUSTRIAL_CONSTANTS = [
  {
    symbol: "π",
    name: "Pi Geométrico",
    token: "π",
    valueLabel: "3,14159265",
    unit: "rad",
    desc: "Perímetro = π × ØMédio",
  },
  {
    symbol: "ρ Aço",
    name: "Densidade Aço Carbono",
    token: "7,85",
    valueLabel: "7,85",
    unit: "g/cm³",
    desc: "Peso = C(m)×L(m)×E(mm)×7,85",
  },
  {
    symbol: "ρ Inox",
    name: "Densidade Aço Inox",
    token: "7,93",
    valueLabel: "7,93",
    unit: "g/cm³",
    desc: "Chapas e tubos AISI 304/316",
  },
  {
    symbol: "ρ Alum",
    name: "Densidade Alumínio",
    token: "2,70",
    valueLabel: "2,70",
    unit: "g/cm³",
    desc: "Ligas estruturais e navais",
  },
  {
    symbol: "in→mm",
    name: "Fator Polegada → mm",
    token: "25,4",
    valueLabel: "25,4",
    unit: "mm/in",
    desc: '1 polegada comercial = 25,4 mm',
  },
  {
    symbol: "g",
    name: "Aceleração da Gravidade",
    token: "9,80665",
    valueLabel: "9,80665",
    unit: "m/s²",
    desc: "Conversão kgf → Newtons (N)",
  },
  {
    symbol: "√2",
    name: "Constante Diagonal 45°",
    token: "1,41421356",
    valueLabel: "1,41421",
    unit: "fator",
    desc: "Diagonal de quadrado / tubulação 45°",
  },
  {
    symbol: "e",
    name: "Constante de Euler",
    token: "e",
    valueLabel: "2,7182818",
    unit: "base",
    desc: "Base de logaritmo natural",
  },
] as const;

const COMMON_FRACTIONS = [
  { label: '1/16"', mm: 1.5875 },
  { label: '1/8"', mm: 3.175 },
  { label: '3/16"', mm: 4.7625 },
  { label: '1/4"', mm: 6.35 },
  { label: '5/16"', mm: 7.9375 },
  { label: '3/8"', mm: 9.525 },
  { label: '1/2"', mm: 12.7 },
  { label: '5/8"', mm: 15.875 },
  { label: '3/4"', mm: 19.05 },
  { label: '7/8"', mm: 22.225 },
  { label: '1"', mm: 25.4 },
  { label: '1 1/4"', mm: 31.75 },
  { label: '1 1/2"', mm: 38.1 },
  { label: '2"', mm: 50.8 },
] as const;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function CalcKey({
  label,
  sub,
  ariaLabel,
  onClick,
  className,
  children,
}: {
  label?: string;
  sub?: string;
  ariaLabel?: string;
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={cn(keyClass, className)}
    >
      {children ?? (
        <>
          <span className="calc-key-main">{label}</span>
          {sub && <span className="calc-key-sub">{sub}</span>}
        </>
      )}
    </button>
  );
}

export function ScientificCalculator() {
  /* Ângulo, casas decimais, tema e cor de destaque vêm das preferências centrais do CALDRA. */
  const { calcAngle, setCalcAngle, calcPlaces, setCalcPlaces, accent, theme } = useSettings();
  const angleMode = calcAngle as AngleMode;
  const setAngleMode = setCalcAngle;
  const decimalPlaces = calcPlaces;
  const setDecimalPlaces = setCalcPlaces;

  const [expression, setExpression] = useState("");
  const [lastCalculationExpr, setLastCalculationExpr] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [ans, setAns] = useState<number>(0);
  const [error, setError] = useState("");
  const [shift, setShift] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("padrao");
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(false);
  const [copied, setCopied] = useState(false);

  // Estados da aba Conversão (mm <-> pol + fração comercial)
  const [convInput, setConvInput] = useState("25,4");
  const [convDirection, setConvDirection] = useState<"mm_to_in" | "in_to_mm">("mm_to_in");
  const [fractionBase, setFractionBase] = useState<16 | 32 | 64>(64);

  // Estados da aba Peso Chapa (C x L x E x Densidade)
  const [sheetLengthMm, setSheetLengthMm] = useState("2000");
  const [sheetWidthMm, setSheetWidthMm] = useState("1000");
  const [sheetThicknessMm, setSheetThicknessMm] = useState("3,00");
  const [sheetMaterialId, setSheetMaterialId] = useState<string>(MATERIALS[0].id);

  // Estados da aba Ângulos & Corda (DMS + Corda de Furação / Arco)
  const [degInput, setDegInput] = useState("45,5");
  const [dmsDeg, setDmsDeg] = useState("45");
  const [dmsMin, setDmsMin] = useState("30");
  const [dmsSec, setDmsSec] = useState("0");
  const [boltDiameter, setBoltDiameter] = useState("300");
  const [boltHoles, setBoltHoles] = useState("8");

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prefs = readJson(PREFS_KEY, { haptics: true, sound: false });
    setHaptics(prefs.haptics);
    setSound(prefs.sound);
    const savedHistory = readJson<HistoryItem[]>(HISTORY_KEY, []);
    setHistory(savedHistory);
    if (savedHistory.length > 0 && Number.isFinite(savedHistory[0]?.value)) {
      setAns(savedHistory[0]!.value);
    }

    if (typeof window !== "undefined") {
      try {
        const rawSeed = window.sessionStorage.getItem("caldra.playground.calculator");
        if (rawSeed) {
          window.sessionStorage.removeItem("caldra.playground.calculator");
          const seed = JSON.parse(rawSeed) as {
            expression?: string;
            lastCalculationExpr?: string;
            value?: number;
            sheetLengthMm?: string;
            sheetWidthMm?: string;
            sheetThicknessMm?: string;
            boltDiameter?: string;
            boltHoles?: string;
          };
          if (seed.expression) setExpression(seed.expression);
          if (seed.lastCalculationExpr) setLastCalculationExpr(seed.lastCalculationExpr);
          if (typeof seed.value === "number") {
            setValue(seed.value);
            setAns(seed.value);
          }
          if (seed.sheetLengthMm) setSheetLengthMm(seed.sheetLengthMm);
          if (seed.sheetWidthMm) setSheetWidthMm(seed.sheetWidthMm);
          if (seed.sheetThicknessMm) setSheetThicknessMm(seed.sheetThicknessMm);
          if (seed.boltDiameter) setBoltDiameter(seed.boltDiameter);
          if (seed.boltHoles) setBoltHoles(seed.boltHoles);
        }
      } catch {
        /* ignora semente inválida */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ haptics, sound }));
  }, [haptics, sound]);

  const accentStyle = useMemo<CSSProperties>(() => {
    const prefersDark =
      mounted &&
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
    const isDark =
      theme === "dark" ||
      theme === "amoled" ||
      (theme === "system" && prefersDark) ||
      (mounted && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
    const storedHex =
      mounted && typeof window !== "undefined" ? window.localStorage.getItem("caldra_accent_color") : null;
    const { accentColor, accentRgb } = resolveAccentColorTokens(accent, isDark, storedHex);
    return {
      "--accent-color": accentColor,
      "--accent-rgb": accentRgb,
      "--calc-cyan": accentColor,
      "--calc-icon": accentColor,
    } as CSSProperties;
  }, [accent, theme, mounted]);

  const feedback = useCallback(() => {
    if (haptics && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
    if (sound && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = 620;
        gain.gain.value = 0.025;
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.025);
      }
    }
  }, [haptics, sound]);

  const append = useCallback(
    (token: string) => {
      feedback();
      setError("");
      setLastCalculationExpr("");
      setExpression((current) => (current === "0" ? token : current + token));
    },
    [feedback],
  );

  const clear = useCallback(() => {
    feedback();
    setExpression("");
    setLastCalculationExpr("");
    setValue(null);
    setError("");
  }, [feedback]);

  const backspace = useCallback(() => {
    feedback();
    setLastCalculationExpr("");
    setExpression((current) => current.slice(0, -1));
    setError("");
  }, [feedback]);

  const calculate = useCallback(() => {
    feedback();
    if (!expression.trim()) return;
    try {
      const next = evaluateExpression(expression, angleMode, ans);
      const shown = formatResult(next, decimalPlaces);
      setValue(next);
      setAns(next);
      setLastCalculationExpr(`${expression} =`);
      setError("");
      const item = { expression, result: shown, value: next, at: Date.now() };
      setHistory((items) => {
        const updated = [item, ...items].slice(0, 30);
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível calcular");
    }
  }, [angleMode, ans, decimalPlaces, expression, feedback]);

  // Avaliação ao vivo silenciosa para pré-visualização e conversão instantânea
  const livePreviewValue = useMemo<number | null>(() => {
    if (!expression.trim()) return value;
    try {
      return evaluateExpression(expression, angleMode, ans);
    } catch {
      return value;
    }
  }, [expression, angleMode, ans, value]);

  const functionKey = (normal: string, shifted: string) => {
    append(`${shift ? shifted : normal}(`);
    if (shift) setShift(false);
  };

  const toggleInchMmOnDisplay = useCallback(() => {
    feedback();
    const target = livePreviewValue ?? value;
    if (target === null || !Number.isFinite(target)) {
      append("×25,4");
      return;
    }
    // Se já temos um valor ativo, abre a aba de conversão já preenchida com ele ou alterna mm/pol
    setConvInput(formatResult(target, decimalPlaces));
    setActiveTab((prev) => (prev === "conversao" ? "padrao" : "conversao"));
  }, [append, decimalPlaces, feedback, livePreviewValue, value]);

  const primaryNumericValue = value ?? livePreviewValue ?? 0;
  const displayed =
    error ||
    (value !== null
      ? formatResult(value, decimalPlaces)
      : livePreviewValue !== null && expression.trim()
        ? formatResult(livePreviewValue, decimalPlaces)
        : "0");

  const copyResult = useCallback(() => {
    feedback();
    const textToCopy = error ? "" : displayed;
    if (!textToCopy) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }, [displayed, error, feedback]);

  const insertValueToExpression = useCallback(
    (num: number) => {
      if (!Number.isFinite(num)) return;
      const formatted = formatResult(num, decimalPlaces);
      feedback();
      setError("");
      setExpression((curr) => (curr ? `${curr}${formatted}` : formatted));
      setValue(num);
      setActiveTab("padrao");
    },
    [decimalPlaces, feedback],
  );

  // Cálculos da Aba Conversão (mm <-> pol decimal + Polegada Fracionária Comercial)
  const parsedConv = Number(convInput.replace(/\./g, "").replace(",", ".")) || 0;
  const convMm = convDirection === "mm_to_in" ? parsedConv : parsedConv * 25.4;
  const convInchInfo = useMemo(
    () => mmToCommercialInchFraction(convMm, fractionBase),
    [convMm, fractionBase],
  );
  const mathFractionText = useMemo(
    () => toFraction(primaryNumericValue),
    [primaryNumericValue],
  );

  // Cálculos da Aba Peso de Chapa (C x L x E x Densidade)
  const selectedMaterial =
    MATERIALS.find((m) => m.id === sheetMaterialId) ?? MATERIALS[0];
  const cMm = Number(sheetLengthMm.replace(",", ".")) || 0;
  const lMm = Number(sheetWidthMm.replace(",", ".")) || 0;
  const eMm = Number(sheetThicknessMm.replace(",", ".")) || 0;
  const areaM2 = (cMm / 1000) * (lMm / 1000);
  const weightKg = areaM2 * eMm * selectedMaterial.density;

  // Cálculos da Aba Ângulos & Corda
  const parsedDeg = Number(degInput.replace(",", ".")) || 0;
  const dmsResult = useMemo(() => decimalToDMS(parsedDeg), [parsedDeg]);
  const parsedDmsToDec = useMemo(
    () =>
      dmsToDecimal(
        Number(dmsDeg.replace(",", ".")) || 0,
        Number(dmsMin.replace(",", ".")) || 0,
        Number(dmsSec.replace(",", ".")) || 0,
      ),
    [dmsDeg, dmsMin, dmsSec],
  );
  const pcd = Number(boltDiameter.replace(",", ".")) || 0;
  const holesCount = Math.max(1, Math.round(Number(boltHoles) || 1));
  const chordLength = holesCount > 1 ? pcd * Math.sin(Math.PI / holesCount) : 0;
  const stepAngleDeg = 360 / holesCount;
  const perimeterMm = Math.PI * pcd;

  const roundingSample = `0,${"0".repeat(decimalPlaces)}`;

  return (
    <div
      style={accentStyle}
      className="calculator-theme flex h-[100dvh] max-h-[100dvh] w-full flex-col justify-between overflow-hidden bg-calc-page px-2 py-1.5 text-calc-text select-none sm:px-4 sm:py-3 lg:items-center lg:justify-center"
    >
      <main className="calc-shell mx-auto flex h-full w-full max-w-[540px] flex-col justify-between overflow-hidden rounded-[22px] border border-calc-border bg-calc-shell p-2.5 shadow-calc sm:max-h-[860px] sm:p-4">
        {/* 1. HEADER COMPACTO */}
        <header className="flex shrink-0 items-center justify-between gap-2 px-0.5 py-0.5">
          <Link to="/" aria-label="Voltar ao início" className="calc-icon-button">
            <ArrowLeft />
          </Link>
          <div className="flex min-w-0 flex-col items-center">
            <h1 className="truncate font-display text-[14px] font-semibold tracking-tight text-calc-text sm:text-[16px]">
              Calculadora Científica &amp; Metalúrgica
            </h1>
          </div>
          <button
            type="button"
            aria-label="Configurações da calculadora"
            onClick={() => setSettingsOpen(true)}
            className="calc-icon-button"
          >
            <Settings />
          </button>
        </header>

        {/* 2. VISOR TÉCNICO DE DUPLA LINHA COM HISTÓRICO VIVO */}
        <section
          aria-label="Display da calculadora"
          className="calc-display mt-1.5 flex shrink-0 flex-col justify-between rounded-[14px] border border-[var(--calc-display-border)] bg-calc-display px-3 py-2 sm:px-4 sm:py-2.5"
        >
          {/* Top Bar do Visor: [ RAD | DEG | GRAD ] à esquerda; [ 0.0000 ▾ ] e [ Histórico ] à direita */}
          <div className="flex items-center justify-between gap-1.5 border-b border-calc-line/70 pb-1.5">
            <div
              role="group"
              aria-label="Unidade angular"
              className="flex items-center rounded-lg border border-calc-line bg-calc-recess p-0.5"
            >
              {(["RAD", "DEG", "GRAD"] as AngleMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    feedback();
                    setAngleMode(mode);
                  }}
                  className={cn(
                    " rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider transition-all sm:px-2.5 sm:text-[11px]",
                    angleMode === mode
                      ? "bg-[var(--calc-cyan)] text-white shadow-xs"
                      : "text-calc-muted hover:text-calc-text",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <label
                title="Precisão de casas decimais"
                className="flex cursor-pointer items-center gap-0.5 rounded-lg border border-calc-line bg-calc-recess px-2 py-0.5 font-mono text-[10px] font-medium text-calc-muted hover:border-[var(--calc-cyan)] hover:text-calc-text sm:text-[11px]"
              >
                <select
                  aria-label="Casas decimais"
                  value={decimalPlaces}
                  onChange={(e) => setDecimalPlaces(Number(e.target.value))}
                  className="cursor-pointer appearance-none bg-transparent pr-0.5 font-mono outline-none"
                >
                  {[2, 4, 6, 8].map((n) => (
                    <option key={n} value={n} className="bg-calc-shell text-calc-text">
                      0,{"0".repeat(n)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-3 shrink-0 opacity-75" />
              </label>

              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-calc-line bg-calc-recess px-2 py-0.5 text-[10px] font-medium text-calc-muted transition-colors hover:border-[var(--calc-cyan)] hover:text-[var(--calc-cyan)] sm:text-[11px]"
              >
                <History className="size-3 text-[var(--calc-cyan)]" />
                <span>Histórico</span>
              </button>
            </div>
          </div>

          {/* Linha 1 — Linha de Expressão (Cálculo em Andamento) */}
          <div className="mt-1.5 flex min-h-[20px] items-center justify-between gap-2">
            <span className="shrink-0 font-mono text-[10px] font-medium text-calc-muted/80">
              {shift ? "SHIFT ATIVO" : ans !== 0 ? `Ans = ${formatResult(ans, 2)}` : "EXPR"}
            </span>
            <div className="min-w-0 flex-1 overflow-x-auto text-right font-mono text-[14px] whitespace-nowrap text-calc-expression tabular-nums sm:text-[15px]">
              {lastCalculationExpr && value !== null && expression ? (
                <span>{expression}</span>
              ) : (
                expression || "0"
              )}
            </div>
          </div>

          {/* Linha 2 — Linha de Resultado Principal (Destaque Máximo + Toque para Copiar) */}
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <button
              type="button"
              onClick={copyResult}
              title="Toque para copiar o resultado"
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-calc-muted transition-colors hover:bg-calc-recess hover:text-[var(--calc-cyan)]"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-500" />
                  <span className="text-emerald-500">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>{mmToCommercialInchFraction(primaryNumericValue, 32).formatted}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={copyResult}
              aria-label="Resultado principal (toque para copiar)"
              className={cn(
                "min-w-0 flex-1 truncate text-right font-mono text-[clamp(1.75rem,4.5dvh,2.65rem)] leading-tight font-bold tracking-tight text-calc-result tabular-nums transition-opacity active:opacity-75",
                error && "text-calc-error text-[clamp(0.95rem,2.4dvh,1.25rem)] font-semibold",
              )}
            >
              {displayed}
            </button>
          </div>
        </section>

        {/* 3. BARRA DE ABAS INTEGRADA (GAVETA DE FERRAMENTAS DE CALDEIRARIA) */}
        <nav
          aria-label="Modos e ferramentas de caldeiraria"
          className="mt-1.5 grid shrink-0 grid-cols-5 gap-1 rounded-xl border border-calc-line bg-calc-recess p-1"
        >
          {(
            [
              { id: "padrao", label: "Teclado", icon: CornerDownRight },
              { id: "conversao", label: "mm ⇄ pol", icon: Ruler },
              { id: "peso", label: "Peso Chapa", icon: Scale },
              { id: "angulos", label: "Ângulos", icon: Compass },
              { id: "constantes", label: "Constantes", icon: Pi },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  feedback();
                  setActiveTab((curr) => (curr === item.id && item.id !== "padrao" ? "padrao" : item.id));
                }}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-all",
                  isActive
                    ? "border border-[var(--calc-cyan)]/35 bg-[var(--calc-tab)] text-[var(--calc-cyan)] shadow-2xs"
                    : "text-calc-muted hover:text-calc-text",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 4. ÁREA PRINCIPAL FLEXÍVEL: TECLADO CIENTÍFICO OU GAVETA TÉCNICA INLINE (ZERO SCROLL EXTERNO) */}
        {activeTab === "padrao" ? (
          <section
            aria-label="Teclado científico e metalúrgico"
            className="mt-1.5 grid min-h-0 flex-1 grid-cols-5 grid-rows-7 gap-1.5 sm:gap-2"
          >
            {/* LINHA 1: Controles Superiores & Caldeiraria Direta */}
            <CalcKey
              onClick={() => {
                feedback();
                setShift((v) => !v);
              }}
              ariaLabel="Alternar funções secundárias Shift"
              className={cn("calc-key-shift", shift && "is-active")}
            >
              <span className="font-mono text-[11px] font-bold tracking-tight sm:text-xs">
                ⇧ SHIFT
              </span>
            </CalcKey>
            <CalcKey
              label={shift ? "a/b" : "in↔mm"}
              sub={shift ? "fração" : "25,4"}
              ariaLabel="Converter polegadas e milímetros"
              onClick={toggleInchMmOnDisplay}
              className="calc-key-sci"
            />
            <CalcKey
              label="hypot"
              sub="a;b"
              ariaLabel="Hipotenusa / Esquadro √(a²+b²)"
              onClick={() => append("hypot(")}
              className="calc-key-sci"
            />
            <CalcKey
              label="AC"
              ariaLabel="Limpar visor"
              onClick={clear}
              className="calc-key-clear"
            />
            <CalcKey
              onClick={backspace}
              ariaLabel="Apagar último caractere"
              className="calc-key-clear"
            >
              <Delete className="size-4 sm:size-5" />
            </CalcKey>

            {/* LINHA 2: Trigonometria & Logaritmos */}
            <CalcKey
              label={shift ? "sin⁻¹" : "sin"}
              sub={shift ? "sin" : "sin⁻¹"}
              onClick={() => functionKey("sin", "asin")}
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "cos⁻¹" : "cos"}
              sub={shift ? "cos" : "cos⁻¹"}
              onClick={() => functionKey("cos", "acos")}
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "tan⁻¹" : "tan"}
              sub={shift ? "tan" : "tan⁻¹"}
              onClick={() => functionKey("tan", "atan")}
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "10ˣ" : "log"}
              sub={shift ? "log" : "10ˣ"}
              onClick={() =>
                shift ? (append("10^("), setShift(false)) : functionKey("log", "log")
              }
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "eˣ" : "ln"}
              sub={shift ? "ln" : "eˣ"}
              onClick={() => functionKey("ln", "exp")}
              className="calc-key-sci"
            />

            {/* LINHA 3: Potências Rápidas, Parênteses e Raízes */}
            <CalcKey
              label={shift ? "x³" : "x²"}
              sub={shift ? "x²" : "x³"}
              ariaLabel={shift ? "Ao cubo" : "Ao quadrado"}
              onClick={() => {
                append(shift ? "^3" : "^2");
                if (shift) setShift(false);
              }}
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "∛x" : "√x"}
              sub={shift ? "√x" : "∛x"}
              ariaLabel={shift ? "Raiz cúbica" : "Raiz quadrada"}
              onClick={() => {
                append(shift ? "cbrt(" : "sqrt(");
                if (shift) setShift(false);
              }}
              className="calc-key-sci"
            />
            <CalcKey
              label="xʸ"
              sub=";"
              ariaLabel="Potência ou separador ponto e vírgula no Shift"
              onClick={() => {
                if (shift) {
                  append(";");
                  setShift(false);
                } else {
                  append("^");
                }
              }}
              className="calc-key-sci"
            />
            <CalcKey label="(" onClick={() => append("(")} className="calc-key-sci" />
            <CalcKey label=")" onClick={() => append(")")} className="calc-key-sci" />

            {/* LINHA 4: 7 8 9 ÷ × */}
            {["7", "8", "9"].map((n) => (
              <CalcKey key={n} label={n} onClick={() => append(n)} className="calc-key-num" />
            ))}
            <CalcKey onClick={() => append("÷")} ariaLabel="Dividir" className="calc-key-operator">
              <Divide className="size-4 sm:size-5" />
            </CalcKey>
            <CalcKey
              onClick={() => append("×")}
              ariaLabel="Multiplicar"
              className="calc-key-operator"
            >
              <X className="size-4 sm:size-5" />
            </CalcKey>

            {/* LINHA 5: 4 5 6 − + */}
            {["4", "5", "6"].map((n) => (
              <CalcKey key={n} label={n} onClick={() => append(n)} className="calc-key-num" />
            ))}
            <CalcKey label="−" onClick={() => append("−")} className="calc-key-operator" />
            <CalcKey label="+" onClick={() => append("+")} className="calc-key-operator" />

            {/* LINHA 6: 1 2 3 π % */}
            {["1", "2", "3"].map((n) => (
              <CalcKey key={n} label={n} onClick={() => append(n)} className="calc-key-num" />
            ))}
            <CalcKey
              label={shift ? "e" : "π"}
              sub={shift ? "π" : "e"}
              ariaLabel={shift ? "Constante de Euler" : "Constante Pi"}
              onClick={() => {
                append(shift ? "e" : "π");
                if (shift) setShift(false);
              }}
              className="calc-key-sci"
            />
            <CalcKey
              label={shift ? "x!" : "%"}
              sub={shift ? "%" : "x!"}
              ariaLabel={shift ? "Fatorial" : "Porcentagem"}
              onClick={() => {
                if (shift) {
                  append("!");
                  setShift(false);
                } else {
                  append("%");
                }
              }}
              className="calc-key-operator"
            />

            {/* LINHA 7: 0 (duplo) , Ans/; = */}
            <CalcKey
              label="0"
              onClick={() => append("0")}
              className="calc-key-num col-span-2"
            />
            <CalcKey label="," onClick={() => append(",")} className="calc-key-num" />
            <CalcKey
              label={shift ? ";" : "Ans"}
              sub={shift ? "Ans" : ";"}
              ariaLabel={shift ? "Separador de argumentos (;)" : "Último resultado (Ans)"}
              onClick={() => {
                if (shift) {
                  append(";");
                  setShift(false);
                } else {
                  append("Ans");
                }
              }}
              className="calc-key-sci"
            />
            <CalcKey
              onClick={calculate}
              ariaLabel="Calcular resultado"
              className="calc-key-equals"
            >
              <Equal className="size-5 sm:size-6" />
            </CalcKey>
          </section>
        ) : (
          /* GAVETA TÉCNICA INLINE (CONVERSÃO / PESO CHAPA / ÂNGULOS / CONSTANTES) */
          <section
            aria-label="Painel técnico de caldeiraria"
            className="mt-1.5 flex min-h-0 flex-1 flex-col justify-between overflow-y-auto rounded-[14px] border border-calc-line bg-calc-display p-3"
          >
            {activeTab === "conversao" && (
              <div className="flex h-full flex-col justify-between gap-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-calc-text">
                      Conversor Industrial mm ⇄ Polegada Fracionária
                    </span>
                    <div className="flex rounded-lg border border-calc-line bg-calc-recess p-0.5 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setConvDirection("mm_to_in")}
                        className={cn(
                          "rounded-md px-2 py-0.5 transition-colors",
                          convDirection === "mm_to_in"
                            ? "bg-[var(--calc-cyan)] text-white"
                            : "text-calc-muted",
                        )}
                      >
                        mm → pol
                      </button>
                      <button
                        type="button"
                        onClick={() => setConvDirection("in_to_mm")}
                        className={cn(
                          "rounded-md px-2 py-0.5 transition-colors",
                          convDirection === "in_to_mm"
                            ? "bg-[var(--calc-cyan)] text-white"
                            : "text-calc-muted",
                        )}
                      >
                        pol → mm
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <input
                      value={convInput}
                      onChange={(e) => setConvInput(e.target.value)}
                      inputMode="decimal"
                      aria-label="Valor para conversão"
                      placeholder="Ex: 31,75"
                      className="h-9 w-full rounded-lg border border-calc-line bg-calc-shell px-3 font-mono text-sm font-semibold text-calc-text outline-none focus:border-[var(--calc-cyan)]"
                    />
                    <div className="flex items-center gap-1 rounded-lg border border-calc-line bg-calc-recess p-0.5 text-[10px] font-mono">
                      {([16, 32, 64] as const).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFractionBase(b)}
                          className={cn(
                            "rounded px-1.5 py-1 transition-colors",
                            fractionBase === b
                              ? "bg-[var(--calc-cyan)] text-white font-bold"
                              : "text-calc-muted",
                          )}
                        >
                          1/{b}&quot;
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resultados simultâneos */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-calc-line bg-calc-shell p-2 text-center">
                      <span className="block text-[10px] text-calc-muted">Fração Comercial</span>
                      <strong className="mt-0.5 block font-mono text-base font-bold text-[var(--calc-cyan)] tabular-nums">
                        {convInchInfo.formatted}
                      </strong>
                      <span className="block font-mono text-[9px] text-calc-muted">
                        Δ {formatResult(convInchInfo.errorMm, 3)} mm
                      </span>
                    </div>
                    <div className="rounded-xl border border-calc-line bg-calc-shell p-2 text-center">
                      <span className="block text-[10px] text-calc-muted">Milímetros (mm)</span>
                      <strong className="mt-0.5 block font-mono text-base font-bold text-calc-result tabular-nums">
                        {formatResult(convMm, 3)}
                      </strong>
                      <button
                        type="button"
                        onClick={() => insertValueToExpression(convMm)}
                        className="mt-0.5 text-[9px] font-semibold text-[var(--calc-cyan)] hover:underline"
                      >
                        Inserir mm
                      </button>
                    </div>
                    <div className="rounded-xl border border-calc-line bg-calc-shell p-2 text-center">
                      <span className="block text-[10px] text-calc-muted">Pol. Decimal</span>
                      <strong className="mt-0.5 block font-mono text-base font-bold text-calc-result tabular-nums">
                        {formatResult(convInchInfo.decimalInch, 4)}&quot;
                      </strong>
                      <span className="block font-mono text-[9px] text-calc-muted">
                        Visor: {mathFractionText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tabela rápida de bitolas comerciais de oficina */}
                <div>
                  <span className="mb-1 block text-[10px] font-semibold text-calc-muted">
                    Bitolas Comerciais Rápidas (toque para enviar ao visor):
                  </span>
                  <div className="grid grid-cols-7 gap-1">
                    {COMMON_FRACTIONS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setConvDirection("mm_to_in");
                          setConvInput(String(item.mm).replace(".", ","));
                          insertValueToExpression(item.mm);
                        }}
                        className="flex flex-col items-center rounded-lg border border-calc-line bg-calc-shell py-1 text-center transition-colors hover:border-[var(--calc-cyan)]"
                      >
                        <span className="font-mono text-[10px] font-bold text-calc-text">
                          {item.label}
                        </span>
                        <span className="font-mono text-[8px] text-calc-muted">
                          {String(item.mm).replace(".", ",")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "peso" && (
              <div className="flex h-full flex-col justify-between gap-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-calc-text">
                      Calculadora Rápida de Peso Teórico de Chapa
                    </span>
                    <span className="font-mono text-[10px] text-calc-muted">
                      ρ = {String(selectedMaterial.density).replace(".", ",")} g/cm³
                    </span>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-calc-muted">
                      Liga Metálica
                    </label>
                    <select
                      aria-label="Selecionar material da chapa"
                      value={sheetMaterialId}
                      onChange={(e) => setSheetMaterialId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-calc-line bg-calc-shell px-2.5 text-xs font-medium text-calc-text outline-none focus:border-[var(--calc-cyan)]"
                    >
                      {MATERIALS.map((mat) => (
                        <option key={mat.id} value={mat.id} className="bg-calc-shell text-calc-text">
                          {mat.name} — {String(mat.density).replace(".", ",")} g/cm³
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-calc-muted">
                        Compr. C (mm)
                      </label>
                      <input
                        value={sheetLengthMm}
                        onChange={(e) => setSheetLengthMm(e.target.value)}
                        inputMode="decimal"
                        className="h-9 w-full rounded-lg border border-calc-line bg-calc-shell px-2.5 font-mono text-xs font-semibold text-calc-text outline-none focus:border-[var(--calc-cyan)]"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-calc-muted">
                        Largura L (mm)
                      </label>
                      <input
                        value={sheetWidthMm}
                        onChange={(e) => setSheetWidthMm(e.target.value)}
                        inputMode="decimal"
                        className="h-9 w-full rounded-lg border border-calc-line bg-calc-shell px-2.5 font-mono text-xs font-semibold text-calc-text outline-none focus:border-[var(--calc-cyan)]"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-calc-muted">
                        Espessura E (mm)
                      </label>
                      <input
                        value={sheetThicknessMm}
                        onChange={(e) => setSheetThicknessMm(e.target.value)}
                        inputMode="decimal"
                        className="h-9 w-full rounded-lg border border-calc-line bg-calc-shell px-2.5 font-mono text-xs font-semibold text-calc-text outline-none focus:border-[var(--calc-cyan)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 items-center gap-2 rounded-xl border border-calc-line bg-calc-shell p-2.5">
                  <div>
                    <span className="block text-[10px] text-calc-muted">
                      Área: {formatResult(areaM2, 3)} m²
                    </span>
                    <strong className="font-mono text-xl font-bold text-[var(--calc-cyan)] tabular-nums">
                      {formatResult(weightKg, 2)} kg
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => insertValueToExpression(weightKg)}
                    className="h-9 rounded-lg bg-[var(--calc-cyan)] px-3 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
                  >
                    Enviar Peso ao Visor
                  </button>
                </div>
              </div>
            )}

            {activeTab === "angulos" && (
              <div className="flex h-full flex-col justify-between gap-2">
                {/* Bloco 1: Conversão Graus Decimais <-> DMS */}
                <div className="space-y-1.5 rounded-xl border border-calc-line bg-calc-shell p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-calc-text">
                      Graus Decimais ⇄ Graus, Minutos e Segundos (DMS)
                    </span>
                    <button
                      type="button"
                      onClick={() => insertValueToExpression(parsedDmsToDec)}
                      className="text-[10px] font-semibold text-[var(--calc-cyan)] hover:underline"
                    >
                      Usar {formatResult(parsedDmsToDec, 4)}°
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[9px] text-calc-muted">Decimal (°) → DMS</span>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <input
                          value={degInput}
                          onChange={(e) => setDegInput(e.target.value)}
                          inputMode="decimal"
                          className="h-8 w-20 rounded-md border border-calc-line bg-calc-display px-2 font-mono text-xs text-calc-text"
                        />
                        <span className="font-mono text-xs font-bold text-[var(--calc-cyan)]">
                          = {dmsResult.formatted}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] text-calc-muted">
                        DMS (G° M&apos; S&quot;) → Decimal
                      </span>
                      <div className="mt-0.5 grid grid-cols-3 gap-1">
                        <input
                          value={dmsDeg}
                          onChange={(e) => setDmsDeg(e.target.value)}
                          placeholder="G°"
                          className="h-8 rounded-md border border-calc-line bg-calc-display px-1.5 text-center font-mono text-xs"
                        />
                        <input
                          value={dmsMin}
                          onChange={(e) => setDmsMin(e.target.value)}
                          placeholder="M'"
                          className="h-8 rounded-md border border-calc-line bg-calc-display px-1.5 text-center font-mono text-xs"
                        />
                        <input
                          value={dmsSec}
                          onChange={(e) => setDmsSec(e.target.value)}
                          placeholder='S"'
                          className="h-8 rounded-md border border-calc-line bg-calc-display px-1.5 text-center font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloco 2: Corda de Furação de Flange & Perímetro de Calandragem */}
                <div className="space-y-1.5 rounded-xl border border-calc-line bg-calc-shell p-2.5">
                  <span className="block text-[11px] font-semibold text-calc-text">
                    Flange (Corda entre Furos) &amp; Desenvolvimento (π × Ø)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-calc-muted">
                        Diâmetro Primitivo / Médio Ø (mm)
                      </label>
                      <input
                        value={boltDiameter}
                        onChange={(e) => setBoltDiameter(e.target.value)}
                        inputMode="decimal"
                        className="mt-0.5 h-8 w-full rounded-md border border-calc-line bg-calc-display px-2 font-mono text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-calc-muted">Nº de Furos / Divisões</label>
                      <input
                        value={boltHoles}
                        onChange={(e) => setBoltHoles(e.target.value)}
                        inputMode="numeric"
                        className="mt-0.5 h-8 w-full rounded-md border border-calc-line bg-calc-display px-2 font-mono text-xs font-semibold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => insertValueToExpression(chordLength)}
                      className="rounded-lg border border-calc-line bg-calc-display p-1.5 transition-colors hover:border-[var(--calc-cyan)]"
                    >
                      <span className="block text-[9px] text-calc-muted">Corda Exata</span>
                      <strong className="font-mono text-xs font-bold text-[var(--calc-cyan)]">
                        {formatResult(chordLength, 2)} mm
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertValueToExpression(stepAngleDeg)}
                      className="rounded-lg border border-calc-line bg-calc-display p-1.5 transition-colors hover:border-[var(--calc-cyan)]"
                    >
                      <span className="block text-[9px] text-calc-muted">Ângulo entre Furos</span>
                      <strong className="font-mono text-xs font-bold text-calc-result">
                        {formatResult(stepAngleDeg, 2)}°
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => insertValueToExpression(perimeterMm)}
                      className="rounded-lg border border-calc-line bg-calc-display p-1.5 transition-colors hover:border-[var(--calc-cyan)]"
                    >
                      <span className="block text-[9px] text-calc-muted">Perímetro (π×Ø)</span>
                      <strong className="font-mono text-xs font-bold text-calc-result">
                        {formatResult(perimeterMm, 1)} mm
                      </strong>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "constantes" && (
              <div className="grid h-full grid-cols-2 gap-1.5 overflow-y-auto">
                {INDUSTRIAL_CONSTANTS.map((c) => (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => {
                      append(c.token);
                      setActiveTab("padrao");
                    }}
                    className="flex flex-col justify-between rounded-xl border border-calc-line bg-calc-shell p-2 text-left transition-colors hover:border-[var(--calc-cyan)]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[var(--calc-cyan)]">
                        {c.symbol}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-calc-result">
                        {c.valueLabel} <span className="text-[9px] text-calc-muted">{c.unit}</span>
                      </span>
                    </div>
                    <span className="truncate text-[10px] font-medium text-calc-text">
                      {c.name}
                    </span>
                    <span className="truncate text-[9px] text-calc-muted">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* MODAL DE HISTÓRICO */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent
          style={accentStyle}
          className="calculator-theme max-h-[75dvh] w-[min(92vw,430px)] overflow-y-auto border-calc-border bg-calc-shell text-calc-text"
        >
          <DialogHeader>
            <DialogTitle>Histórico de Cálculos</DialogTitle>
            <DialogDescription className="text-calc-muted">
              Toque em qualquer expressão para reutilizá-la no visor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-calc-muted">Nenhum cálculo registrado.</p>
            ) : (
              history.map((item) => (
                <button
                  key={item.at}
                  type="button"
                  onClick={() => {
                    setExpression(item.expression);
                    setValue(item.value);
                    setAns(item.value);
                    setHistoryOpen(false);
                  }}
                  className="w-full rounded-xl border border-calc-line bg-calc-display p-3 text-left transition-colors hover:border-[var(--calc-cyan)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-calc-muted">
                      {item.expression} =
                    </span>
                    <span className="font-mono text-[10px] text-calc-muted">
                      {new Date(item.at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-calc-muted">
                      {mmToCommercialInchFraction(item.value, 32).formatted}
                    </span>
                    <span className="font-mono text-lg font-bold text-calc-result tabular-nums">
                      {item.result}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                localStorage.removeItem(HISTORY_KEY);
              }}
              className="text-sm font-medium text-calc-muted hover:text-calc-error"
            >
              Limpar histórico
            </button>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIGURAÇÕES */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          style={accentStyle}
          className="calculator-theme w-[min(92vw,430px)] border-calc-border bg-calc-shell text-calc-text"
        >
          <DialogHeader>
            <DialogTitle>Configurações da Calculadora</DialogTitle>
            <DialogDescription className="text-calc-muted">
              Ajustes de resposta tátil, som e precisão numérica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SettingRow label="Feedback tátil (vibração)" icon={<Beaker />}>
              <Switch checked={haptics} onCheckedChange={setHaptics} />
            </SettingRow>
            <SettingRow label="Som mecânico das teclas" icon={sound ? <Volume2 /> : <VolumeX />}>
              <Switch checked={sound} onCheckedChange={setSound} />
            </SettingRow>
            <div>
              <p className="mb-2 text-xs font-semibold text-calc-muted">Unidade de ângulo</p>
              <div className="grid grid-cols-3 gap-2">
                {(["RAD", "DEG", "GRAD"] as AngleMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAngleMode(m)}
                    className={cn(
                      "rounded-lg border border-calc-line p-2 font-mono text-xs font-semibold transition-colors",
                      angleMode === m &&
                        "border-[var(--calc-cyan)] bg-[var(--calc-active)] text-[var(--calc-cyan)]",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-calc-muted">
                Casas decimais ({roundingSample})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[2, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDecimalPlaces(n)}
                    className={cn(
                      "rounded-lg border border-calc-line p-2 font-mono text-xs font-semibold transition-colors",
                      decimalPlaces === n &&
                        "border-[var(--calc-cyan)] bg-[var(--calc-active)] text-[var(--calc-cyan)]",
                    )}
                  >
                    {n} casas
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-calc-line bg-calc-display p-3">
      <span className="flex items-center gap-2 text-sm [&>svg]:size-4">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

