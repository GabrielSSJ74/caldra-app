/**
 * CALDRA — CHAMFER INTENT 2.0
 * Fase 4 (Claude §5): Motor de Voz Industrial (pt-BR)
 *
 * Funcionalidades:
 *  - Máquina de estados do microfone (inactive · listening · processing);
 *  - Reconhecimento via Web Speech API (SpeechRecognition / webkitSpeechRecognition, lang='pt-BR',
 *    interimResults=true) com fim automático após ~1,5 s de silêncio;
 *  - Fallback MediaRecorder (WAV/OGG/MP3/WebM) para navegadores sem Web Speech API (ex.: Firefox);
 *  - Normalização pós-voz determinística para ambiente de oficina:
 *      • números por extenso compostos ("quinhentos por duzentos e cinquenta" → "500 × 250"),
 *      • decimais falados ("dois vírgula cinco" → "2,5", "dez ponto dois" → "10.2"),
 *      • conectivos dimensionais ("por", "vezes") → "×",
 *      • unidades ("milímetros" → "mm", "centímetros" → "cm", "polegadas" → "pol"),
 *      • prefixos geométricos ("diâmetro" → "Ø", "raio" → "R"),
 *      • glossário de caldeiraria/oficina (PCD, rasgo oblongo, flange, chanfro, concordância,
 *        tronco de cone, gomos);
 *  - Leitura opcional da resposta em voz (speechSynthesis, pt-BR, desligada por padrão, sem armazenar áudio).
 */

export type VoiceMicState = "inactive" | "listening" | "processing";

export interface VoiceEngineConfig {
  lang?: string;
  silenceTimeoutMs?: number;
  autoSendOnSpeechEnd?: boolean;
  ttsEnabled?: boolean;
}

export const CHAMFER_VOICE_GLOSSARY: ReadonlyArray<{
  spokenVariants: RegExp[];
  canonical: string;
}> = [
  {
    spokenVariants: [/\bp\s*c\s*d\b/gi, /\bpecede\b/gi, /\bpê\s*cê\s*dê\b/gi],
    canonical: "PCD",
  },
  {
    spokenVariants: [/\brasgo\s+oblongo\b/gi, /\boblongo\b/gi, /\brasgo\s+ovalado\b/gi],
    canonical: "rasgo oblongo",
  },
  {
    spokenVariants: [/\bflanje\b/gi, /\bflangi\b/gi],
    canonical: "flange",
  },
  {
    spokenVariants: [/\bxanfro\b/gi, /\bchanfrado\b/gi],
    canonical: "chanfro",
  },
  {
    spokenVariants: [/\bconcordancia\b/gi, /\bconcordância\b/gi],
    canonical: "concordância",
  },
  {
    spokenVariants: [/\btronco\s+de\s+coni\b/gi, /\btronco\s+de\s+cone\b/gi],
    canonical: "tronco de cone",
  },
  {
    spokenVariants: [/\bcurva\s+de\s+gomos\b/gi, /\bgomos\b/gi],
    canonical: "gomos",
  },
];

const PT_BR_UNITS_MAP: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const PT_BR_TENS_MAP: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  cinqüenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const PT_BR_HUNDREDS_MAP: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

function parseSpokenNumberToken(word: string): { kind: "unit" | "ten" | "hundred" | "thousand"; value: number } | null {
  const clean = word.toLowerCase().trim();
  if (clean === "mil") return { kind: "thousand", value: 1000 };
  if (clean in PT_BR_HUNDREDS_MAP) return { kind: "hundred", value: PT_BR_HUNDREDS_MAP[clean]! };
  if (clean in PT_BR_TENS_MAP) return { kind: "ten", value: PT_BR_TENS_MAP[clean]! };
  if (clean in PT_BR_UNITS_MAP) return { kind: "unit", value: PT_BR_UNITS_MAP[clean]! };
  return null;
}

/**
 * Converte sequências de números por extenso em português (ex.: "duzentos e cinquenta" → "250",
 * "mil e duzentos" → "1200", "quinhentos" → "500") sem alterar palavras normais da frase.
 */
export function replaceCompoundSpokenNumbersPtBr(input: string): string {
  const tokens = input.split(/(\s+)/);
  const out: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const rawTok = tokens[i]!;
    const stripped = rawTok.replace(/[.,;:!?]/g, "");
    const firstNum = parseSpokenNumberToken(stripped);

    if (!firstNum) {
      out.push(rawTok);
      i++;
      continue;
    }

    let total = 0;
    let currentGroup = firstNum.kind === "thousand" ? 1000 : firstNum.value;
    let lastAcceptedIndex = i;
    let j = i + 1;

    while (j < tokens.length) {
      // Pula espaços
      if (/^\s+$/.test(tokens[j]!)) {
        j++;
        continue;
      }
      const word = tokens[j]!.toLowerCase().replace(/[.,;:!?]/g, "");
      if (word === "e") {
        // Verifica se depois do "e" há outro token numérico
        let k = j + 1;
        while (k < tokens.length && /^\s+$/.test(tokens[k]!)) k++;
        if (k < tokens.length) {
          const nextNum = parseSpokenNumberToken(tokens[k]!.replace(/[.,;:!?]/g, ""));
          if (nextNum) {
            if (nextNum.kind === "thousand") {
              currentGroup = (currentGroup || 1) * 1000;
            } else {
              currentGroup += nextNum.value;
            }
            lastAcceptedIndex = k;
            j = k + 1;
            continue;
          }
        }
        break;
      }

      const directNext = parseSpokenNumberToken(word);
      if (directNext && directNext.kind === "thousand") {
        total += (currentGroup || 1) * 1000;
        currentGroup = 0;
        lastAcceptedIndex = j;
        j++;
        continue;
      }
      break;
    }

    const finalValue = total + currentGroup;
    const trailingPunct = rawTok.match(/[.,;:!?]+$/)?.[0] ?? "";
    out.push(`${finalValue}${trailingPunct}`);
    i = lastAcceptedIndex + 1;
  }

  return out.join("");
}

export const DEFAULT_VOICE_ENGINE_CONFIG: Required<VoiceEngineConfig> = {
  lang: "pt-BR",
  silenceTimeoutMs: 1500,
  autoSendOnSpeechEnd: false, // §9.1: desligado por padrão; usuário revisa/edita antes de enviar
  ttsEnabled: false,
};

/**
 * Normaliza uma transcrição de voz em pt-BR para notação técnica de CAD (§5 Claude / §9.3 ChatGPT).
 * Exemplos:
 *  - "chapa de quinhentos por duzentos e cinquenta milímetros com quatro furos diâmetro doze vírgula cinco"
 *    → "chapa de 500 × 250 mm com 4 furos Ø12,5"
 *  - "meio metro" → "500 mm"
 *  - "um metro e meio" → "1500 mm"
 *  - "meia polegada" → "12,7 mm"
 *  - "três oitavos" → "9,525 mm"
 */
export function normalizePtBrVoiceTranscript(rawTranscript: string): string {
  if (!rawTranscript || !rawTranscript.trim()) return "";

  let text = rawTranscript.trim();

  // 1. Aplica glossário fonético de oficina (PCD, rasgo oblongo, flange, chanfro, tronco de cone...)
  for (const entry of CHAMFER_VOICE_GLOSSARY) {
    for (const pattern of entry.spokenVariants) {
      text = text.replace(pattern, entry.canonical);
    }
  }

  // 1b. Expressões fracionárias e métricas compostas antes da troca numérica (§9.3)
  text = text.replace(/\bum\s+metro\s+e\s+meio\b/gi, "1500 mm");
  text = text.replace(/\bmeio\s+metro\b/gi, "500 mm");
  text = text.replace(/\bmeia\s+polegada\b/gi, "12,7 mm");
  text = text.replace(/\btr[eê]s\s+oitavos(?:\s+de\s+polegada)?\b/gi, "9,525 mm");
  text = text.replace(/\bcinco\s+oitavos(?:\s+de\s+polegada)?\b/gi, "15,875 mm");
  text = text.replace(/\btr[eê]s\s+quartos(?:\s+de\s+polegada)?\b/gi, "19,05 mm");
  text = text.replace(/\bum\s+quarto\s+de\s+polegada\b/gi, "6,35 mm");

  // 2. Converte números por extenso compostos ("quinhentos", "duzentos e cinquenta", "vinte e cinco")
  text = replaceCompoundSpokenNumbersPtBr(text);

  // 3. Converte decimais falados ("2 vírgula 5" → "2,5" / "10 ponto 2" → "10.2")
  text = text.replace(/(\d+)\s+v[íi]rgula\s+(\d+)/gi, "$1,$2");
  text = text.replace(/(\d+)\s+ponto\s+(\d+)/gi, "$1.$2");

  // 4. Converte conectivos dimensionais entre números ("500 por 250", "500 vezes 250" → "500 × 250")
  text = text.replace(/(\d+(?:[.,]\d+)?)\s+(?:por|vezes|x)\s+(\d+(?:[.,]\d+)?)/gi, "$1 × $2");

  // 5. Normaliza unidades faladas ("milímetros" → "mm", "centímetros" → "cm", "polegadas" → "pol")
  text = text.replace(/\bmil[íi]metros?\b/gi, "mm");
  text = text.replace(/\bcent[íi]metros?\b/gi, "cm");
  text = text.replace(/\bpolegadas?\b/gi, "pol");

  // 6. Normaliza prefixos de diâmetro e raio antes de números ("diâmetro 12" → "Ø12", "raio 20" → "R20")
  text = text.replace(/\bdi[âa]metro(?:\s+de)?\s*(\d+(?:[.,]\d+)?)/gi, "Ø$1");
  text = text.replace(/\braio(?:\s+de)?\s*(\d+(?:[.,]\d+)?)/gi, "R$1");

  return text.replace(/\s{2,}/g, " ").trim();
}

/**
 * Detecta se o navegador suporta Web Speech API nativa (`SpeechRecognition` ou `webkitSpeechRecognition`).
 */
export function isWebSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Detecta se o navegador suporta fallback via `MediaRecorder`.
 */
export function isMediaRecorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.MediaRecorder !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia);
}

/**
 * Lê um texto em voz alta usando `window.speechSynthesis` em `pt-BR` (§5: opcional, desligado por padrão).
 */
export function speakAssistantResponsePtBr(text: string, enabled = false): boolean {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
