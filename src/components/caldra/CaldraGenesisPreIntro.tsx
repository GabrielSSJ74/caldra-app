import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CaldraGenesisPreIntroProps {
  /** Chamado quando a animação termina naturalmente ou o usuário pula */
  onComplete: () => void;
  /** Se deve permitir pular a animação (padrão true) */
  allowSkip?: boolean;
  /** Duração total da animação em milissegundos (padrão 4400ms) */
  durationMs?: number;
  className?: string;
}

/**
 * GÊNESE VISUAL CALDRA — ANIMAÇÃO PRÉ-INTRODUÇÃO (2D VETORIAL)
 *
 * Duração: ~4.4 segundos (3 a 5 segundos conforme especificado).
 *
 * Etapas da narrativa técnica de engenharia:
 * 1. Campo Técnico: Tela #051833 -> ponto luminoso central -> malha milimetrada rosada sutil se expande -> eixos X e Y.
 * 2. Construção Geométrica: Raios em 45°, círculos de compasso, linhas auxiliares de traçagem e cotas discretas (CAD).
 * 3. Construção do Símbolo: O traçado do "C" externo e da pastilha interna convergem para a geometria canônica oficial.
 * 4. Preenchimento: Áreas fechadas preenchidas progressivamente (prata/branco primeiro, depois azul CALDRA).
 * 5. Transformação: Linhas auxiliares e grid dissolvem suavemente; a marca permanece como resultado natural do cálculo.
 * 6. Logo Final: Emblema oficial límpido centralizado com profundidade discreta, transicionando suavemente para a introdução.
 */
export function CaldraGenesisPreIntro({
  onComplete,
  allowSkip = true,
  durationMs = 4400,
  className,
}: CaldraGenesisPreIntroProps) {
  // Progresso normalizado de 0 a 1
  const [progress, setProgress] = useState(0);
  // Estado de transição final (fade out para a tela seguinte)
  const [isExiting, setIsExiting] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const handleFinish = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      onComplete();
    }, 450);
  }, [isExiting, onComplete]);

  useEffect(() => {
    let active = true;

    const frame = (timestamp: number) => {
      if (!active) return;
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const rawP = Math.min(1, elapsed / durationMs);

      // Curva suave com aceleração e desaceleração contínua
      setProgress(rawP);

      if (rawP < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Transição suave ao fim da etapa 6
        window.setTimeout(() => {
          if (active) handleFinish();
        }, 300);
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, handleFinish]);

  // Suporte a tecla Escape / Teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        handleFinish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleFinish]);

  /* ------------------------------------------------------------- */
  /* CÁLCULO DAS ETAPAS (PROGRESSÕES TEMPORAIS DE 0 A 1)          */
  /* ------------------------------------------------------------- */

  // Função auxiliar de interpolação com clamping
  const mapRange = (t: number, start: number, end: number) => {
    if (t <= start) return 0;
    if (t >= end) return 1;
    const norm = (t - start) / (end - start);
    // Smooth step cúbico
    return norm * norm * (3 - 2 * norm);
  };

  // Etapa 1: Ponto luminoso & Malha técnica milimetrada (0.00 -> 0.22)
  const pDot = mapRange(progress, 0.0, 0.08);
  const pGridExpand = mapRange(progress, 0.04, 0.22);
  const pAxes = mapRange(progress, 0.08, 0.24);

  // Etapa 2: Construção geométrica CAD (círculos, raios 45°, guias) (0.18 -> 0.45)
  const pConstruction = mapRange(progress, 0.18, 0.42);
  const pCompassArcs = mapRange(progress, 0.22, 0.46);

  // Etapa 3: Traçado do contorno oficial do símbolo (0.35 -> 0.65)
  const pDrawOuterC = mapRange(progress, 0.35, 0.62);
  const pDrawInnerBlue = mapRange(progress, 0.45, 0.68);

  // Etapa 4: Preenchimento das regiões fechadas (0.60 -> 0.78)
  const pFillWhite = mapRange(progress, 0.60, 0.74);
  const pFillBlue = mapRange(progress, 0.66, 0.80);

  // Etapa 5: Transformação & Dissolução das linhas auxiliares (0.76 -> 0.90)
  const pGuidesFadeOut = 1 - mapRange(progress, 0.74, 0.88);
  const pGridFadeOut = 1 - mapRange(progress, 0.78, 0.92);

  // Etapa 6: Emblema canônico final limpo e estável (0.88 -> 1.0)
  const pFinalSheen = mapRange(progress, 0.85, 0.98);

  /* Dimensões do viewBox (100x100) para máxima fidelidade geométrica */
  const cOuterLength = 295;
  const cInnerLength = 80;

  // Calculando strokeDashoffset para os contornos
  const outerStrokeDash = Math.max(0, cOuterLength * (1 - pDrawOuterC));
  const innerStrokeDash = Math.max(0, cInnerLength * (1 - pDrawInnerBlue));

  return (
    <aside
      aria-label="Abertura técnica Caldra"
      className={cn(
        "fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden select-none",
        "bg-[#051833] text-white transition-opacity duration-500 ease-out",
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100",
        className,
      )}
    >
      {/* Botão sutil para pular (discreto, no canto superior) */}
      {allowSkip && (
        <button
          type="button"
          onClick={handleFinish}
          className="absolute top-5 right-6 z-30 font-mono text-[11px] tracking-widest uppercase text-sky-200/50 hover:text-white transition-colors duration-200 px-3 py-1.5 rounded-full border border-sky-400/15 hover:border-sky-400/40 backdrop-blur-sm cursor-pointer"
        >
          Pular
        </button>
      )}

      {/* Indicador discreto de fase técnica / status CAD no rodapé */}
      <footer className="absolute bottom-6 inset-x-0 z-30 flex items-center justify-between px-8 text-sky-300/40 font-mono text-[9px] tracking-[0.25em] pointer-events-none">
        <span className="hidden sm:inline">CALDRA CAD · KERNEL 2D</span>
        <span className="mx-auto sm:mx-0">
          {progress < 0.22 && "ESTRUTURANDO CAMPO TÉCNICO"}
          {progress >= 0.22 && progress < 0.45 && "TRAÇANDO GEOMETRIA E COTAS"}
          {progress >= 0.45 && progress < 0.65 && "COMPUTANDO SÍMBOLO CANÔNICO"}
          {progress >= 0.65 && progress < 0.82 && "CONVERGINDO PREENCHIMENTO"}
          {progress >= 0.82 && "SÍMBOLO CONCLUÍDO"}
        </span>
        <span className="hidden sm:inline">PRECISÃO ZERO FRESTA</span>
      </footer>

      {/* ============================================================== */}
      {/* CANVAS VETORIAL PRINCIPAL SVG (100% ESCALÁVEL E ULTRA PRECISO) */}
      {/* ============================================================== */}
      <div className="relative flex items-center justify-center w-full h-full max-w-[92vw] max-h-[85vh] aspect-square">
        <svg
          viewBox="-50 -50 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-[580px] max-h-[580px] overflow-visible drop-shadow-2xl"
          aria-hidden="true"
        >
          <defs>
            {/* 1. MALHA MILIMETRADA TÉCNICA (tonalidade rosada/avermelhada suave sobre #051833) */}
            <pattern
              id="genesis-subgrid"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 5 0 L 0 0 0 5"
                fill="none"
                stroke="#FB7185"
                strokeWidth="0.25"
                strokeOpacity="0.14"
              />
            </pattern>

            <pattern
              id="genesis-majorgid"
              width="25"
              height="25"
              patternUnits="userSpaceOnUse"
            >
              <rect width="25" height="25" fill="url(#genesis-subgrid)" />
              <path
                d="M 25 0 L 0 0 0 25"
                fill="none"
                stroke="#F43F5E"
                strokeWidth="0.55"
                strokeOpacity="0.28"
              />
            </pattern>

            {/* Máscara radial de expansão da malha a partir do ponto central (50, 50) */}
            <mask id="grid-expansion-mask">
              <circle
                cx="50"
                cy="50"
                r={pGridExpand * 140}
                fill="#FFFFFF"
              />
            </mask>

            {/* Gradiente sutil metálico prateado/aço do corpo C */}
            <linearGradient id="c-sheen" x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#F8FAFC" />
              <stop offset="75%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>

            {/* Gradiente azul vibrante oficial do elemento interno */}
            <linearGradient id="blue-chevron" x1="43" y1="42.5" x2="75.5" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="30%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#0055D4" />
            </linearGradient>

            {/* Reflexo chanfrado especular sobre o logo final */}
            <linearGradient id="specular-reflection" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
              <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <stop offset="70%" stopColor="#051833" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
            </linearGradient>

            {/* Máscara de reveal progressivo para o preenchimento do C */}
            <clipPath id="fill-c-clip">
              <rect
                x="15"
                y="15"
                width={70 * pFillWhite}
                height="70"
              />
            </clipPath>

            {/* Máscara de reveal progressivo para a pastilha azul */}
            <clipPath id="fill-blue-clip">
              <rect
                x="40"
                y="40"
                width={40 * pFillBlue}
                height="25"
              />
            </clipPath>
          </defs>

          {/* ========================================================== */}
          {/* ETAPA 1: MALHA TÉCNICA MILIMETRADA (EXPANSÃO CENTRAL)     */}
          {/* ========================================================== */}
          {pGridExpand > 0 && pGridFadeOut > 0 && (
            <g
              mask="url(#grid-expansion-mask)"
              opacity={Math.min(1, pGridExpand * 1.5) * pGridFadeOut}
            >
              <rect
                x="-50"
                y="-50"
                width="200"
                height="200"
                fill="url(#genesis-majorgid)"
              />
            </g>
          )}

          {/* Eixos cartesianos X e Y centrais (Origem em 50, 50) */}
          {pAxes > 0 && pGuidesFadeOut > 0 && (
            <g opacity={pAxes * pGuidesFadeOut}>
              {/* Eixo X */}
              <line
                x1={50 - 75 * pAxes}
                y1="50"
                x2={50 + 75 * pAxes}
                y2="50"
                stroke="#38BDF8"
                strokeWidth="0.6"
                strokeDasharray="4 2"
                strokeOpacity="0.65"
              />
              {/* Eixo Y */}
              <line
                x1="50"
                y1={50 - 75 * pAxes}
                x2="50"
                y2={50 + 75 * pAxes}
                stroke="#38BDF8"
                strokeWidth="0.6"
                strokeDasharray="4 2"
                strokeOpacity="0.65"
              />

              {/* Ticks de calibração milimétrica nos eixos */}
              {[-30, -20, -10, 10, 20, 30].map((delta) => (
                <g key={`tick-${delta}`} opacity={pAxes * 0.8}>
                  {/* Tick no X */}
                  <line
                    x1={50 + delta}
                    y1={48.8}
                    x2={50 + delta}
                    y2={51.2}
                    stroke="#F43F5E"
                    strokeWidth="0.4"
                    strokeOpacity="0.7"
                  />
                  {/* Tick no Y */}
                  <line
                    x1={48.8}
                    y1={50 + delta}
                    x2={51.2}
                    y2={50 + delta}
                    stroke="#F43F5E"
                    strokeWidth="0.4"
                    strokeOpacity="0.7"
                  />
                </g>
              ))}

              {/* Marcação da origem técnica (0, 0) */}
              <circle
                cx="50"
                cy="50"
                r="1.8"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="0.5"
                strokeOpacity="0.8"
              />
            </g>
          )}

          {/* Ponto luminoso germinal inicial no centro */}
          {progress < 0.35 && (
            <g opacity={(1 - mapRange(progress, 0.15, 0.35)) * pDot}>
              {/* Brilho suave */}
              <circle
                cx="50"
                cy="50"
                r="4"
                fill="#38BDF8"
                fillOpacity="0.3"
              />
              {/* Ponto central límpido */}
              <circle
                cx="50"
                cy="50"
                r="1.2"
                fill="#FFFFFF"
              />
            </g>
          )}

          {/* ========================================================== */}
          {/* ETAPA 2: CONSTRUÇÃO GEOMÉTRICA (RAIOS, CÍRCULOS, COMPASSO) */}
          {/* ========================================================== */}
          {pConstruction > 0 && pGuidesFadeOut > 0 && (
            <g opacity={pConstruction * pGuidesFadeOut}>
              {/* Linhas de traçado a 45° (guias fundamentais de caldeiraria) */}
              <line
                x1={50 - 55 * pConstruction}
                y1={50 - 55 * pConstruction}
                x2={50 + 55 * pConstruction}
                y2={50 + 55 * pConstruction}
                stroke="#94A3B8"
                strokeWidth="0.4"
                strokeDasharray="3 3"
                strokeOpacity="0.55"
              />
              <line
                x1={50 - 55 * pConstruction}
                y1={50 + 55 * pConstruction}
                x2={50 + 55 * pConstruction}
                y2={50 - 55 * pConstruction}
                stroke="#94A3B8"
                strokeWidth="0.4"
                strokeDasharray="3 3"
                strokeOpacity="0.55"
              />

              {/* Caixa delimitadora de engenharia 64x64 mm (de 18 a 82) */}
              <rect
                x="18"
                y="18"
                width="64"
                height="64"
                fill="none"
                stroke="#64748B"
                strokeWidth="0.35"
                strokeDasharray="2 3"
                strokeOpacity={0.45 * pConstruction}
              />

              {/* Tangentes e prolongamentos técnicos horizontais e verticais */}
              {/* Topo e Base */}
              <line
                x1="8"
                y1="18"
                x2="92"
                y2="18"
                stroke="#38BDF8"
                strokeWidth="0.35"
                strokeDasharray="4 4"
                strokeOpacity="0.4"
              />
              <line
                x1="8"
                y1="82"
                x2="92"
                y2="82"
                stroke="#38BDF8"
                strokeWidth="0.35"
                strokeDasharray="4 4"
                strokeOpacity="0.4"
              />
              {/* Costas do C */}
              <line
                x1="18"
                y1="8"
                x2="18"
                y2="92"
                stroke="#38BDF8"
                strokeWidth="0.35"
                strokeDasharray="4 4"
                strokeOpacity="0.4"
              />
              {/* Pontas do C */}
              <line
                x1="82"
                y1="10"
                x2="82"
                y2="75"
                stroke="#38BDF8"
                strokeWidth="0.35"
                strokeDasharray="4 4"
                strokeOpacity="0.35"
              />

              {/* Linha de centro da boca (Y = 33.5 e Y = 66.5) */}
              <line
                x1="45"
                y1="33.5"
                x2="75"
                y2="33.5"
                stroke="#94A3B8"
                strokeWidth="0.3"
                strokeDasharray="2 2"
                strokeOpacity="0.5"
              />
              <line
                x1="45"
                y1="66.5"
                x2="85"
                y2="66.5"
                stroke="#94A3B8"
                strokeWidth="0.3"
                strokeDasharray="2 2"
                strokeOpacity="0.5"
              />

              {/* Alinhamento da pastilha azul (Y = 42.5 e Y = 58) */}
              <line
                x1="35"
                y1="42.5"
                x2="68"
                y2="42.5"
                stroke="#38BDF8"
                strokeWidth="0.3"
                strokeDasharray="1 2"
                strokeOpacity="0.5"
              />
              <line
                x1="52"
                y1="58"
                x2="82"
                y2="58"
                stroke="#38BDF8"
                strokeWidth="0.3"
                strokeDasharray="1 2"
                strokeOpacity="0.5"
              />
            </g>
          )}

          {/* Círculos e Arcos de Compasso técnicos */}
          {pCompassArcs > 0 && pGuidesFadeOut > 0 && (
            <g opacity={pCompassArcs * pGuidesFadeOut}>
              {/* Círculo de raio R32 (tangente externa) */}
              <circle
                cx="50"
                cy="50"
                r="32"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="0.45"
                strokeDasharray="3 3"
                strokeOpacity="0.5"
              />

              {/* Círculo do entalhe central R23.33 */}
              <circle
                cx="50"
                cy="50"
                r="23.33"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="0.35"
                strokeDasharray="2 3"
                strokeOpacity="0.45"
              />

              {/* Círculo menor R16.5 */}
              <circle
                cx="50"
                cy="50"
                r="16.5"
                fill="none"
                stroke="#64748B"
                strokeWidth="0.3"
                strokeDasharray="2 2"
                strokeOpacity="0.4"
              />

              {/* Arcos de compasso de chanfro a 45° nos vértices */}
              {/* Chanfro superior esquerdo (18, 38) -> (38, 18) com centro teórico em (38, 38) */}
              <path
                d="M 18 38 A 20 20 0 0 1 38 18"
                fill="none"
                stroke="#F43F5E"
                strokeWidth="0.4"
                strokeDasharray="1.5 1.5"
                strokeOpacity="0.65"
              />
              {/* Chanfro inferior esquerdo (18, 62) -> (38, 82) */}
              <path
                d="M 18 62 A 20 20 0 0 0 38 82"
                fill="none"
                stroke="#F43F5E"
                strokeWidth="0.4"
                strokeDasharray="1.5 1.5"
                strokeOpacity="0.65"
              />

              {/* Cruzes de centro nos nós principais (+) */}
              {[
                { x: 38, y: 18 },
                { x: 82, y: 18 },
                { x: 66.5, y: 33.5 },
                { x: 50, y: 33.5 },
                { x: 33.5, y: 50 },
                { x: 50, y: 66.5 },
                { x: 82, y: 66.5 },
                { x: 66.5, y: 82 },
                { x: 38, y: 82 },
                { x: 18, y: 62 },
                { x: 18, y: 38 },
                { x: 43, y: 42.5 },
                { x: 60, y: 42.5 },
                { x: 75.5, y: 58 },
                { x: 58.5, y: 58 },
              ].map((pt, i) => (
                <g key={`cross-${i}`} opacity={pCompassArcs * 0.75}>
                  <line
                    x1={pt.x - 1.2}
                    y1={pt.y}
                    x2={pt.x + 1.2}
                    y2={pt.y}
                    stroke="#F8FAFC"
                    strokeWidth="0.35"
                  />
                  <line
                    x1={pt.x}
                    y1={pt.y - 1.2}
                    x2={pt.x}
                    y2={pt.y + 1.2}
                    stroke="#F8FAFC"
                    strokeWidth="0.35"
                  />
                </g>
              ))}

              {/* Cotas e anotações técnicas discretas de CAD */}
              <text
                x="84"
                y="16"
                fill="#38BDF8"
                fontSize="2.8"
                fontFamily="monospace"
                opacity="0.7"
              >
                (82, 18)
              </text>
              <text
                x="8"
                y="86"
                fill="#38BDF8"
                fontSize="2.8"
                fontFamily="monospace"
                opacity="0.7"
              >
                (18, 82)
              </text>
              <text
                x="48"
                y="14"
                fill="#94A3B8"
                fontSize="2.6"
                fontFamily="monospace"
                opacity="0.6"
              >
                R32.0 · 45°
              </text>
              <text
                x="68"
                y="52"
                fill="#38BDF8"
                fontSize="2.4"
                fontFamily="monospace"
                opacity="0.6"
              >
                CAD·REF
              </text>
            </g>
          )}

          {/* ========================================================== */}
          {/* ETAPA 4: PREENCHIMENTO PROGRESSIVO DAS FORMAS FECHADAS     */}
          {/* ========================================================== */}

          {/* Preenchimento do Corpo 'C' (Prata/Aço/Branco) */}
          {pFillWhite > 0 && (
            <g clipPath="url(#fill-c-clip)">
              <path
                d="M 38 18 L 82 18 L 66.5 33.5 L 50 33.5 L 33.5 50 L 50 66.5 L 82 66.5 L 66.5 82 L 38 82 L 18 62 L 18 38 Z"
                fill="url(#c-sheen)"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeLinejoin="round"
                opacity={Math.min(1, pFillWhite * 1.3)}
              />
            </g>
          )}

          {/* Preenchimento da Pastilha Interna (Azul CALDRA) */}
          {pFillBlue > 0 && (
            <g clipPath="url(#fill-blue-clip)">
              <path
                d="M 43 42.5 L 60 42.5 L 75.5 58 L 58.5 58 Z"
                fill="url(#blue-chevron)"
                stroke="#38BDF8"
                strokeWidth="1.2"
                strokeLinejoin="round"
                opacity={Math.min(1, pFillBlue * 1.3)}
              />
            </g>
          )}

          {/* ========================================================== */}
          {/* ETAPA 3: TRAÇADO DE LINHA EM TEMPO REAL (CANETA TÉCNICA)  */}
          {/* ========================================================== */}

          {/* Linha canônica do "C" desenhando continuamente em tempo real */}
          {pDrawOuterC > 0 && (
            <path
              d="M 38 18 L 82 18 L 66.5 33.5 L 50 33.5 L 33.5 50 L 50 66.5 L 82 66.5 L 66.5 82 L 38 82 L 18 62 L 18 38 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={cOuterLength}
              strokeDashoffset={outerStrokeDash}
              className="drop-shadow-sm"
              opacity={Math.min(1, pDrawOuterC * 1.5)}
            />
          )}

          {/* Linha canônica do elemento interno desenhando continuamente */}
          {pDrawInnerBlue > 0 && (
            <path
              d="M 43 42.5 L 60 42.5 L 75.5 58 L 58.5 58 Z"
              fill="none"
              stroke="#007AFF"
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={cInnerLength}
              strokeDashoffset={innerStrokeDash}
              opacity={Math.min(1, pDrawInnerBlue * 1.5)}
            />
          )}

          {/* ========================================================== */}
          {/* ETAPA 6: LOGO FINAL — SÍMBOLO OFICIAL LÍMPIDO E PERFEITO   */}
          {/* ========================================================== */}
          {pFinalSheen > 0 && (
            <g opacity={pFinalSheen}>
              {/* Reflexo sutil de profundidade especular chanfrado */}
              <path
                d="M 38 18 L 82 18 L 66.5 33.5 L 50 33.5 L 33.5 50 L 50 66.5 L 82 66.5 L 66.5 82 L 38 82 L 18 62 L 18 38 Z"
                fill="url(#specular-reflection)"
                stroke="transparent"
                strokeWidth="0"
                className="pointer-events-none"
              />

              {/* Brilho límpido suave no elemento azul */}
              <path
                d="M 43 42.5 L 60 42.5 L 75.5 58 L 58.5 58 Z"
                fill="none"
                stroke="#60A5FA"
                strokeWidth="0.8"
                strokeLinejoin="round"
                opacity="0.8"
              />
            </g>
          )}
        </svg>
      </div>
    </aside>
  );
}
