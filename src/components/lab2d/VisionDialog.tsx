import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Circle as CircleIcon,
  Eraser,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  RotateCw,
  Ruler,
  Scan,
  Spline,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Entity } from "@/lib/lab2d/core";
import { uid } from "@/lib/lab2d/core";
import { CUT_COLOR, MARK_COLOR } from "@/lib/lab2d/technical";
import { importImage, type ImportedImage } from "@/lib/vision/imageImportService";
import type { Prim, Tolerance } from "@/lib/vision/geometryRecognizer";
import { analyzeImage, toEntities, type VisionAnalysis } from "@/lib/vision/vectorizer";
import { countDuplicates, normalizeGeometry } from "@/lib/vision/geometryNormalizer";
import {
  calibrateByDimension,
  calibrateByMeasure,
  DEFAULT_CALIBRATION,
  type Calibration,
} from "@/lib/vision/scaleCalibrationService";
import { validateVector } from "@/lib/vision/vectorValidationService";
import {
  analyzeLogo,
  DEFAULT_LOGO,
  logoToEntities,
  type LogoAnalysis,
  type LogoOptions,
} from "@/lib/vision/logoPipeline";
import { pathToSvg } from "@/lib/lab2d/bezier";
import type { TurnPolicy } from "@/lib/vision/logoTracer";

export type VisionImageLayer = {
  src: string;
  name: string;
  /** Largura/altura em mm do plano de fundo, já calibradas. */
  widthMm: number;
  heightMm: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
};

type Step = "importar" | "previa" | "analisando" | "resultado";
/** Técnico procura LINE/ARC/CIRCLE; logo preserva curvas de Bézier. */
type Mode = "tecnico" | "logo";
type Overlay = "original" | "vetor" | "ambos";
type Manual = { pts: { x: number; y: number }[]; mode: "linha" | "arco"; closed: boolean };

/** CHAMFER VISION — imagem → vetor → geometria CAD editável. */
export function VisionDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (entities: Entity[], image: VisionImageLayer) => void;
}) {
  const [step, setStep] = useState<Step>("importar");
  const [img, setImg] = useState<ImportedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // pré-visualização
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);

  // análise
  const [mode, setMode] = useState<Mode>("tecnico");
  const [logoOpt, setLogoOpt] = useState<LogoOptions>(DEFAULT_LOGO);
  const [logo, setLogo] = useState<LogoAnalysis | null>(null);
  const [tolerance, setTolerance] = useState<Tolerance>("media");
  const [noise, setNoise] = useState(1);
  const [analysis, setAnalysis] = useState<VisionAnalysis | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("ambos");

  // calibração
  const [cal, setCal] = useState<Calibration>(DEFAULT_CALIBRATION);
  const [widthMm, setWidthMm] = useState("");
  const [calMode, setCalMode] = useState<"dimensao" | "medida">("dimensao");
  const [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]);
  const [realMm, setRealMm] = useState("100");

  // manual
  const [manual, setManual] = useState<Manual | null>(null);

  const reset = useCallback(() => {
    setStep("importar");
    setImg(null);
    setError(null);
    setRotation(0);
    setOpacity(1);
    setZoom(1);
    setAnalysis(null);
    setLogo(null);
    setLogoOpt(DEFAULT_LOGO);
    setCal(DEFAULT_CALIBRATION);
    setWidthMm("");
    setCalPts([]);
    setManual(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const pick = async (file: File) => {
    setError(null);
    try {
      const imported = await importImage(file);
      setImg(imported);
      setStep("previa");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar imagem.");
    }
  };

  const run = async () => {
    if (!img) return;
    setStep("analisando");
    setError(null);
    await new Promise((r) => setTimeout(r, 260));
    try {
      if (mode === "logo") {
        const res = analyzeLogo(img.element, logoOpt);
        setAnalysis(null);
        setLogo(res.stats.contours + res.stats.holes ? res : null);
        if (!res.stats.contours && !res.stats.holes)
          setError("Nenhum contorno encontrado. Ajuste o limiar ou inverta tinta/fundo.");
        setStep("resultado");
        return;
      }
      setLogo(null);
      const res = analyzeImage(img.element, { tolerance, noise, rotationDeg: rotation });
      if (!res.prims.length) {
        setAnalysis(null);
        setError("Não foi possível reconhecer toda a geometria desta imagem.");
        setStep("resultado");
        return;
      }
      setAnalysis(res);
      setStep("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na análise.");
      setStep("resultado");
    }
  };

  // reanalisa ao mudar parâmetros do modo logo
  useEffect(() => {
    if (step !== "resultado" || !img || mode !== "logo") return;
    const t = setTimeout(() => {
      try {
        const res = analyzeLogo(img.element, logoOpt);
        if (res.stats.contours + res.stats.holes) setLogo(res);
      } catch {
        /* mantém resultado anterior */
      }
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoOpt]);

  // reanalisa ao mudar tolerância/ruído já no resultado
  useEffect(() => {
    if (step !== "resultado" || !img || !analysis) return;
    const t = setTimeout(() => {
      try {
        const res = analyzeImage(img.element, { tolerance, noise, rotationDeg: rotation });
        setAnalysis(res.prims.length ? res : null);
      } catch {
        /* mantém resultado anterior */
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tolerance, noise]);

  const manualEntities = useMemo<Entity[]>(() => {
    const geo = logo ?? analysis;
    if (!manual || manual.pts.length < 2 || !geo) return [];
    const s = cal.mmPerPx;
    const ox = geo.contentPx.x;
    const oy = geo.contentPx.y;
    return [
      {
        id: uid(),
        layer: "corte",
        type: "polyline",
        closed: manual.closed,
        pts: manual.pts.map((p) => ({ x: (p.x - ox) * s, y: (p.y - oy) * s })),
      },
    ];
  }, [manual, analysis, logo, cal]);

  const rawEntities = useMemo<Entity[]>(
    () =>
      logo
        ? // cada cor da paleta vira uma camada técnica distinta
          logoToEntities(logo, cal, "corte", (_sw, i) => (i === 0 ? "corte" : "marcacao"))
        : analysis
          ? toEntities(analysis, cal)
          : [],
    [analysis, logo, cal],
  );

  const normalized = useMemo(
    () =>
      logo
        ? // curvas nunca passam pelo normalizador de polilinhas
          { entities: [...rawEntities, ...manualEntities], report: { removedTiny: 0, nearlyClosed: [] as unknown[] } }
        : normalizeGeometry([...rawEntities, ...manualEntities], { autoClose: false }),
    [rawEntities, manualEntities, logo],
  );

  const duplicates = useMemo(() => countDuplicates(rawEntities), [rawEntities]);
  const validation = useMemo(() => validateVector(normalized.entities, cal), [normalized, cal]);

  const applyDimension = () => {
    const geo = logo ?? analysis;
    if (!geo) return;
    const w = Number(widthMm.replace(",", "."));
    const next = calibrateByDimension(geo.contentPx, { widthMm: w });
    if (!next) {
      toast.error("Informe uma largura válida em mm.");
      return;
    }
    setCal(next);
    toast.success(`Escala: ${next.mmPerPx.toFixed(4)} mm/px`);
  };

  const applyMeasure = () => {
    if (calPts.length < 2) {
      toast.error("Selecione dois pontos na imagem.");
      return;
    }
    const next = calibrateByMeasure(calPts[0]!, calPts[1]!, Number(realMm.replace(",", ".")));
    if (!next) {
      toast.error("Distância real inválida.");
      return;
    }
    setCal(next);
    toast.success(`Escala: ${next.mmPerPx.toFixed(4)} mm/px`);
  };

  const create = () => {
    if (!img || (!analysis && !logo)) return;
    const list = normalized.entities;
    if (!list.length) {
      toast.error("Nada para inserir.");
      return;
    }
    const s = cal.mmPerPx;
    const geo = (logo ?? analysis)!;
    onCreate(list, {
      src: img.dataUrl,
      name: img.name,
      widthMm: geo.imagePx.w * s,
      heightMm: geo.imagePx.h * s,
      x: -geo.contentPx.x * s,
      y: -geo.contentPx.y * s,
      opacity: 0.35,
      visible: true,
      locked: true,
    });
    toast.success(`${list.length} entidades criadas no plano.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[92vh] max-w-xl overflow-y-auto border-0">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            CHAMFER VISION
            <span className="ml-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Imagem → Vetor
            </span>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {step === "importar" && (
          <label className="metal flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
            <Upload className="size-6 text-accent" />
            <span className="text-sm">Importar imagem</span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              PNG · JPG · JPEG · WEBP
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void pick(f);
              }}
            />
          </label>
        )}

        {step === "previa" && img && (
          <>
            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-border bg-white">
              <img
                src={img.dataUrl}
                alt={`Pré-visualização de ${img.name}`}
                style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, opacity }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Zoom" value={zoom} min={0.4} max={3} step={0.05} onChange={setZoom} />
              <Slider label="Opacidade" value={opacity} min={0.2} max={1} step={0.05} onChange={setOpacity} />
            </div>
            <Section title="Modo de vetorização" icon={Spline}>
              <div className="flex gap-1">
                <Toggle active={mode === "tecnico"} onClick={() => setMode("tecnico")} label="técnico" />
                <Toggle active={mode === "logo"} onClick={() => setMode("logo")} label="logo (curvas)" />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                {mode === "tecnico"
                  ? "Reconhece linhas, arcos e círculos de desenhos técnicos."
                  : "Preserva curvas de Bézier reais — exporta SPLINE, sem microsegmentos."}
              </p>
            </Section>
            <div className="flex items-center gap-2">
              <Chip icon={RotateCw} label="Girar 90°" onClick={() => setRotation((r) => (r + 90) % 360)} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {img.widthPx} × {img.heightPx} px
              </span>
              <button
                onClick={() => void run()}
                className="brand-gradient ml-auto rounded-xl px-4 py-2 font-display text-sm font-semibold text-background"
              >
                Continuar
              </button>
            </div>

          </>
        )}

        {step === "analisando" && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
              Analisando imagem…
            </p>
          </div>
        )}

        {step === "resultado" && img && logo && (
          <>
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
              Contornos de Bézier
            </p>
            <LogoCanvas img={img} logo={logo} overlay={overlay} />
            <div className="flex flex-wrap items-center gap-1">
              {(["original", "vetor", "ambos"] as Overlay[]).map((o) => (
                <Toggle key={o} active={overlay === o} onClick={() => setOverlay(o)} label={o} />
              ))}
            </div>
            <LogoStats logo={logo} cal={cal} entities={normalized.entities} />
            <LogoControls opt={logoOpt} onChange={(o) => setLogoOpt({ ...logoOpt, ...o })} />

            <Section title="Escala" icon={Ruler}>
              <div className="flex items-center gap-2">
                <input
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                  inputMode="decimal"
                  placeholder="Largura real (mm)"
                  className="metal w-40 rounded-xl px-3 py-2 text-sm outline-none"
                />
                <button onClick={applyDimension} className="rounded-xl border border-border px-3 py-2 text-xs">
                  Aplicar
                </button>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">{cal.note}</p>
            </Section>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep("previa")}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
              >
                Voltar
              </button>
              <button
                disabled={!normalized.entities.length}
                onClick={create}
                className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background disabled:opacity-40"
              >
                Criar geometria
              </button>
            </div>
          </>
        )}

        {step === "resultado" && img && !logo && (
          <>
            {analysis ? (
              <>
                <p className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
                  Geometria encontrada
                </p>

                <PreviewCanvas
                  img={img}
                  analysis={analysis}
                  overlay={overlay}
                  rotation={rotation}
                  manual={manual}
                  calPts={calMode === "medida" ? calPts : []}
                  onPick={(p) => {
                    if (manual) {
                      setManual({ ...manual, pts: [...manual.pts, p] });
                    } else if (calMode === "medida") {
                      setCalPts((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
                    }
                  }}
                />

                <div className="flex flex-wrap items-center gap-1">
                  {(["original", "vetor", "ambos"] as Overlay[]).map((o) => (
                    <Toggle key={o} active={overlay === o} onClick={() => setOverlay(o)} label={o} />
                  ))}
                </div>

                <Stats analysis={analysis} cal={cal} entities={normalized.entities} />

                <Section title="Tolerância" icon={Spline}>
                  <div className="flex gap-1">
                    {(["baixa", "media", "alta"] as Tolerance[]).map((t) => (
                      <Toggle key={t} active={tolerance === t} onClick={() => setTolerance(t)} label={t} />
                    ))}
                  </div>
                </Section>

                <Section title="Limpeza" icon={Eraser}>
                  <div className="flex flex-wrap items-center gap-1">
                    {[0, 1, 2].map((n) => (
                      <Toggle
                        key={n}
                        active={noise === n}
                        onClick={() => setNoise(n)}
                        label={n === 0 ? "sem ruído" : n === 1 ? "limpar ruído" : "limpar forte"}
                      />
                    ))}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {duplicates} duplicadas · {normalized.report.removedTiny} minúsculas
                    </span>
                  </div>
                  {normalized.report.nearlyClosed.length > 0 && (
                    <p className="font-mono text-[10px] text-amber-500">
                      {normalized.report.nearlyClosed.length} contorno(s) quase fechado(s) — revise após inserir.
                    </p>
                  )}
                </Section>

                <Section title="Escala" icon={Ruler}>
                  <div className="flex gap-1">
                    <Toggle active={calMode === "dimensao"} onClick={() => setCalMode("dimensao")} label="dimensões" />
                    <Toggle active={calMode === "medida"} onClick={() => setCalMode("medida")} label="2 pontos" />
                  </div>
                  {calMode === "dimensao" ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={widthMm}
                        onChange={(e) => setWidthMm(e.target.value)}
                        inputMode="decimal"
                        placeholder="Largura real (mm)"
                        className="metal w-40 rounded-xl px-3 py-2 text-sm outline-none"
                      />
                      <button onClick={applyDimension} className="rounded-xl border border-border px-3 py-2 text-xs">
                        Aplicar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {calPts.length}/2 pontos
                      </span>
                      <input
                        value={realMm}
                        onChange={(e) => setRealMm(e.target.value)}
                        inputMode="decimal"
                        className="metal w-24 rounded-xl px-3 py-2 text-sm outline-none"
                      />
                      <button onClick={applyMeasure} className="rounded-xl border border-border px-3 py-2 text-xs">
                        Calibrar
                      </button>
                    </div>
                  )}
                  <p className="font-mono text-[10px] text-muted-foreground">{cal.note}</p>
                </Section>

                <Section title="Validação" icon={Check}>
                  <ul className="space-y-0.5 font-mono text-[10px]">
                    <li>✓ {validation.counts.lines} linhas · {validation.counts.circles} círculos · {validation.counts.arcs} arcos</li>
                    <li>✓ {validation.counts.closed} contornos fechados · unidade mm · 1:1</li>
                    {validation.issues.map((i, idx) => (
                      <li key={idx} className="text-amber-500">⚠ {i.message}</li>
                    ))}
                  </ul>
                </Section>

                <Section title="Vetorização manual" icon={MousePointerClick}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Toggle
                      active={!!manual}
                      onClick={() => setManual(manual ? null : { pts: [], mode: "linha", closed: false })}
                      label={manual ? "ativa" : "ativar"}
                    />
                    {manual && (
                      <>
                        <Toggle
                          active={manual.mode === "linha"}
                          onClick={() => setManual({ ...manual, mode: "linha" })}
                          label="linha"
                        />
                        <Toggle
                          active={manual.closed}
                          onClick={() => setManual({ ...manual, closed: !manual.closed })}
                          label="fechar"
                        />
                        <Chip
                          icon={Undo2}
                          label="Desfazer"
                          onClick={() => setManual({ ...manual, pts: manual.pts.slice(0, -1) })}
                        />
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {manual.pts.length} pontos
                        </span>
                      </>
                    )}
                  </div>
                </Section>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Não foi possível reconhecer toda a geometria. Ajuste a tolerância, limpe o ruído ou use a
                  vetorização manual.
                </p>
                <div className="flex gap-1">
                  {(["baixa", "media", "alta"] as Tolerance[]).map((t) => (
                    <Toggle
                      key={t}
                      active={tolerance === t}
                      onClick={() => {
                        setTolerance(t);
                        void run();
                      }}
                      label={t}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep("previa")}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
              >
                Voltar
              </button>
              <button
                disabled={!normalized.entities.length}
                onClick={create}
                className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background disabled:opacity-40"
              >
                Criar geometria
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ auxiliares */

function PreviewCanvas({
  img,
  analysis,
  overlay,
  rotation,
  manual,
  calPts,
  onPick,
}: {
  img: ImportedImage;
  analysis: VisionAnalysis;
  overlay: Overlay;
  rotation: number;
  manual: Manual | null;
  calPts: { x: number; y: number }[];
  onPick: (p: { x: number; y: number }) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const { w, h } = analysis.imagePx;

  const click = (e: React.MouseEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * w;
    const sy = ((e.clientY - r.top) / r.height) * h;
    onPick({ x: sx, y: sy });
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full rounded-2xl border border-border bg-white"
      onClick={click}
      role="img"
      aria-label="Pré-visualização da vetorização"
    >
      {overlay !== "vetor" && (
        <image
          href={img.dataUrl}
          x={0}
          y={0}
          width={w}
          height={h}
          opacity={overlay === "ambos" ? 0.45 : 1}
          transform={rotation ? `rotate(${rotation} ${w / 2} ${h / 2})` : undefined}
          preserveAspectRatio="none"
        />
      )}
      {overlay !== "original" && (
        <g fill="none" stroke={CUT_COLOR} strokeWidth={Math.max(1, w / 500)}>
          {analysis.prims.map((p, i) => (
            <PrimShape key={i} p={p} />
          ))}
        </g>
      )}
      {manual && manual.pts.length > 0 && (
        <g>
          <polyline
            points={manual.pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={MARK_COLOR}
            strokeWidth={Math.max(1.5, w / 400)}
          />
          {manual.pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={Math.max(2, w / 200)} fill={MARK_COLOR} />
              <text x={p.x + w / 80} y={p.y} fontSize={w / 45} fill={MARK_COLOR}>
                P{i + 1}
              </text>
            </g>
          ))}
        </g>
      )}
      {calPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={Math.max(2.5, w / 180)} fill="#00CCFF" />
      ))}
    </svg>
  );
}

/** Prévia do traçado de logo: curvas reais, furos em âmbar. */
function LogoCanvas({
  img,
  logo,
  overlay,
}: {
  img: ImportedImage;
  logo: LogoAnalysis;
  overlay: Overlay;
}) {
  const { w, h } = logo.imagePx;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full rounded-2xl border border-border bg-white"
      role="img"
      aria-label="Prévia do traçado por curvas"
    >
      {overlay !== "vetor" && (
        <image
          href={img.dataUrl}
          x={0}
          y={0}
          width={w}
          height={h}
          opacity={overlay === "ambos" ? 0.35 : 1}
          preserveAspectRatio="none"
        />
      )}
      {overlay !== "original" && (
        <g fill="none" strokeWidth={Math.max(1, w / 500)}>
          {logo.layers.flatMap((l, li) =>
            l.paths.map((t, i) => (
              <path
                key={`${li}-${i}`}
                d={pathToSvg(t.start, t.segs, true)}
                stroke={t.hole ? MARK_COLOR : CUT_COLOR}
              />
            )),
          )}
        </g>
      )}
    </svg>
  );
}

function LogoStats({
  logo,
  cal,
  entities,
}: {
  logo: LogoAnalysis;
  cal: Calibration;
  entities: Entity[];
}) {
  const s = cal.mmPerPx;
  return (
    <div className="metal grid grid-cols-2 gap-1 rounded-2xl p-3 font-mono text-[10px] text-muted-foreground">
      <span>{logo.stats.contours} contornos</span>
      <span>{logo.stats.holes} furos</span>
      <span>{logo.stats.curves} curvas</span>
      <span>{logo.stats.segments} segmentos</span>
      <span className="col-span-2 text-foreground">
        {(logo.contentPx.w * s).toFixed(1)} × {(logo.contentPx.h * s).toFixed(1)} mm ·{" "}
        {entities.length} entidades · SPLINE no DXF
      </span>
    </div>
  );
}

const TURN_POLICIES: TurnPolicy[] = ["minority", "majority", "black", "white", "left", "right"];

function LogoControls({
  opt,
  onChange,
}: {
  opt: LogoOptions;
  onChange: (o: Partial<LogoOptions>) => void;
}) {
  return (
    <>
      <Section title="Pré-processamento" icon={ImageIcon}>
        <div className="grid grid-cols-2 gap-2">
          <Slider label={`Ampliação ${opt.upscale}×`} value={opt.upscale} min={1} max={4} step={1}
            onChange={(v) => onChange({ upscale: v })} />
          <Slider label={`Suavizar (JPG) ${opt.blur}px`} value={opt.blur} min={0} max={3} step={1}
            onChange={(v) => onChange({ blur: v })} />
          <Slider label={`Limiar ${opt.threshold}`} value={opt.threshold} min={20} max={235} step={1}
            onChange={(v) => onChange({ threshold: v })} />
          <Slider label={`Fechar furos ${opt.closeHoles}`} value={opt.closeHoles} min={0} max={3} step={1}
            onChange={(v) => onChange({ closeHoles: v })} />
        </div>
        <div className="flex flex-wrap gap-1">
          <Toggle active={opt.invert} onClick={() => onChange({ invert: !opt.invert })} label="inverter tinta" />
          <Toggle active={opt.detectCircles} onClick={() => onChange({ detectCircles: !opt.detectCircles })}
            label="furos redondos → círculo" />
        </div>
      </Section>

      <Section title="Traçado" icon={Spline}>
        <div className="grid grid-cols-2 gap-2">
          <Slider label={`Poeira (turdsize) ${opt.turdsize}`} value={opt.turdsize} min={0} max={12} step={1}
            onChange={(v) => onChange({ turdsize: v })} />
          <Slider label={`Cantos (alphamax) ${opt.alphamax.toFixed(2)}`} value={opt.alphamax} min={0} max={1.34} step={0.02}
            onChange={(v) => onChange({ alphamax: v })} />
          <Slider label={`Fidelidade (opttolerance) ${opt.opttolerance.toFixed(2)}`} value={opt.opttolerance}
            min={0.05} max={1} step={0.05} onChange={(v) => onChange({ opttolerance: v })} />
          <Slider label={`Cores ${opt.colors}`} value={opt.colors} min={1} max={6} step={1}
            onChange={(v) => onChange({ colors: v })} />
        </div>
        <div className="flex flex-wrap gap-1">
          {TURN_POLICIES.map((t) => (
            <Toggle key={t} active={opt.turnpolicy === t} onClick={() => onChange({ turnpolicy: t })} label={t} />
          ))}
        </div>
      </Section>
    </>
  );
}

function PrimShape({ p }: { p: Prim }) {
  if (p.kind === "line") return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />;
  if (p.kind === "circle") return <circle cx={p.cx} cy={p.cy} r={p.r} />;
  if (p.kind === "arc") {
    const x0 = p.cx + p.r * Math.cos(p.a0);
    const y0 = p.cy + p.r * Math.sin(p.a0);
    const x1 = p.cx + p.r * Math.cos(p.a1);
    const y1 = p.cy + p.r * Math.sin(p.a1);
    let sweep = p.a1 - p.a0;
    while (sweep < 0) sweep += Math.PI * 2;
    return <path d={`M ${x0} ${y0} A ${p.r} ${p.r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}`} />;
  }
  return (
    <polyline
      points={p.pts.map((q) => `${q.x},${q.y}`).join(" ") + (p.closed && p.pts[0] ? ` ${p.pts[0].x},${p.pts[0].y}` : "")}
    />
  );
}

function Stats({
  analysis,
  cal,
  entities,
}: {
  analysis: VisionAnalysis;
  cal: Calibration;
  entities: Entity[];
}) {
  const s = cal.mmPerPx;
  return (
    <div className="metal grid grid-cols-2 gap-1 rounded-2xl p-3 font-mono text-[10px] text-muted-foreground">
      <span>{analysis.stats.lines} linhas</span>
      <span>{analysis.stats.circles} círculos</span>
      <span>{analysis.stats.arcs} arcos</span>
      <span>{analysis.stats.polylines} polilinhas</span>
      <span>{analysis.stats.contours} contornos</span>
      <span>{analysis.stats.holes} furos</span>
      <span className="col-span-2 text-foreground">
        {(analysis.contentPx.w * s).toFixed(1)} × {(analysis.contentPx.h * s).toFixed(1)} mm ·{" "}
        {entities.length} entidades
      </span>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Ruler;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        <Icon className="size-3" /> {title}
      </p>
      {children}
    </div>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors ${
        active ? "bg-accent/15 text-accent" : "border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Chip({ icon: Icon, label, onClick }: { icon: typeof RotateCw; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

export const VISION_ICONS = { ImageIcon, Scan, CircleIcon, X };
