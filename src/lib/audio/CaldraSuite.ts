/**
 * CALDRA ORIGINAL AMBIENT SOUNDTRACK — "THE ARCHITECTURE OF CURIOSITY"
 *
 * Uma composição instrumental 100% original criada para o CALDRA.
 * Inspirada na arquitetura sonora sutil e minimalista de obras atmosféricas
 * como as de C418 (Haggstrom, Key, Living Mice, Minecraft):
 *
 * - Piano acústico/elétrico extremamente suave e espaçado
 * - Kalimba / mallets cristalinos e orgânicos respondendo nos espaços
 * - Celesta e glockenspiel pontuais em mudanças harmônicas
 * - Harpa dedilhada delicada como textura
 * - Cordas sustentadas lentas e serenas na expansão
 * - Pad analógico quente como "ar" atrás do piano (Moog/Prophet style)
 * - Textura synth ambiente, shimmer granular e ruído tonal sutil
 * - Sub-bass eletrônico discreto (profundidade pura, sem batida)
 * - Grande sensação de espaço, reverberação longa e silêncio ativo
 *
 * Estrutura:
 * [0:00 - 0:30] INTRO — CURIOSIDADE: Piano sozinho, muito espaço e silêncio.
 * [0:30 - 1:00] AR & ESPAÇO: Piano + pad analógico distante.
 * [1:00 - 1:30] REFLEXO: Pequeno elemento cristalino (celesta/glockenspiel).
 * [1:30 - 2:05] EXPLORAÇÃO: Kalimba / mallet orgânico respondendo.
 * [2:05 - 2:40] EXPANSÃO HARMÔNICA: Cordas muito leves, harpa textural e subgrave.
 * [2:40 - 3:10] CONTEMPLAÇÃO: Retirada lenta das camadas.
 * [3:10 - 3:30] RETORNO & LOOP PERFEITO: Piano + ambiente com resolução aberta.
 */

export interface MovementDescriptor {
  index: number;
  name: string;
  narrative: string;
  startTime: number;
  endTime: number;
  description: string;
}

export const CALDRA_MOVEMENTS: MovementDescriptor[] = [
  {
    index: 0,
    name: "Intro — Curiosidade",
    narrative: "CURIOSITY",
    startTime: 0,
    endTime: 30,
    description: "Piano íntimo e solitário, notas raras com reverb longo e silêncio generoso.",
  },
  {
    index: 1,
    name: "Ar & Espaço — Pad Distante",
    narrative: "ATMOSPHERE",
    startTime: 30,
    endTime: 60,
    description: "Pad analógico suave entra como ar morno por trás das frases do piano.",
  },
  {
    index: 2,
    name: "Reflexo — Ponto de Luz",
    narrative: "DISCOVERY",
    startTime: 60,
    endTime: 90,
    description: "Sinos cristalinos e glockenspiel pontual destacando mudanças harmônicas.",
  },
  {
    index: 3,
    name: "Exploração — Resposta da Kalimba",
    narrative: "EXPLORATION",
    startTime: 90,
    endTime: 125,
    description: "Mallets de kalimba macia respondem aos vazios melódicos com leveza e movimento.",
  },
  {
    index: 4,
    name: "Expansão Harmônica — Cordas & Harpa",
    narrative: "EXPANSION",
    startTime: 125,
    endTime: 160,
    description: "Cordas sutis, arpejos de harpa e subgrave discreto sem bateria ou peso excessivo.",
  },
  {
    index: 5,
    name: "Contemplação — Recolhimento",
    narrative: "CONTEMPLATION",
    startTime: 160,
    endTime: 190,
    description: "Retirada gradual e serena das camadas acústicas e eletrônicas.",
  },
  {
    index: 6,
    name: "Retorno & Loop Perfeito",
    narrative: "RENEWAL",
    startTime: 190,
    endTime: 210,
    description: "Piano e ambiência final com resolução aberta que conecta de volta ao início.",
  },
];

export const TOTAL_SUITE_DURATION = 210; // 3 minutos e 30 segundos (Loop Perfeito)

export type InstrumentType =
  | "felt_piano"
  | "kalimba"
  | "celesta"
  | "harp"
  | "strings"
  | "analog_pad"
  | "synth_texture"
  | "sub_bass";

export interface ScoreEvent {
  t: number; // Offset em segundos (0 a 210)
  instrument: InstrumentType;
  frequencies: number[]; // Frequência(s) em Hz
  velocity: number; // 0.01 a 0.08
  duration: number; // Duração do sustain em segundos
  pan?: number; // Panorâmica estéreo (-0.8 a 0.8)
}

/**
 * PARTITURA COMPLETA DE "CALDRA — THE ARCHITECTURE OF CURIOSITY"
 * Harmonia aberta: Dadd9, Gmaj7#11, Bm9, Asus4/Aadd9
 * 210 segundos projetados para loop contínuo e orgânico.
 */
export const CALDRA_SCORE: ScoreEvent[] = [
  // =========================================================================
  // 1. INTRO [0:00 - 0:30] — CURIOSIDADE (PIANO SOZINHO)
  // Piano elétrico/acústico muito suave, poucas notas, muito espaço entre elas.
  // Assinatura melódica original: "O que existe depois?"
  // =========================================================================
  { t: 3.0, instrument: "felt_piano", frequencies: [293.66], velocity: 0.052, duration: 4.5, pan: -0.05 }, // D4
  { t: 6.2, instrument: "felt_piano", frequencies: [369.99], velocity: 0.05, duration: 4.2, pan: 0.0 }, // F#4
  { t: 9.5, instrument: "felt_piano", frequencies: [440.0], velocity: 0.055, duration: 4.5, pan: 0.05 }, // A4
  { t: 13.0, instrument: "felt_piano", frequencies: [659.25], velocity: 0.058, duration: 5.0, pan: 0.1 }, // E5 (a 9ª suspensa!)
  { t: 16.5, instrument: "felt_piano", frequencies: [554.37], velocity: 0.05, duration: 5.5, pan: 0.0 }, // C#5 (repouso no ar)

  // Espaço de silêncio e cauda de reverb (17s a 20s)

  // Resposta suave do piano
  { t: 21.0, instrument: "felt_piano", frequencies: [493.88], velocity: 0.052, duration: 4.0, pan: -0.08 }, // B4
  { t: 23.5, instrument: "felt_piano", frequencies: [369.99], velocity: 0.046, duration: 3.8, pan: -0.02 }, // F#4
  { t: 26.0, instrument: "felt_piano", frequencies: [440.0], velocity: 0.05, duration: 4.2, pan: 0.05 }, // A4
  { t: 28.5, instrument: "felt_piano", frequencies: [293.66], velocity: 0.048, duration: 5.5, pan: 0.0 }, // D4

  // =========================================================================
  // 2. AR & ESPAÇO [0:30 - 1:00] — PAD DISTANTE & ATMOSFERA
  // Pad analógico entra quente e imóvel como "ar" atrás do piano.
  // =========================================================================
  {
    t: 30.0,
    instrument: "analog_pad",
    frequencies: [146.83, 220.0, 293.66, 369.99], // D3, A3, D4, F#4
    velocity: 0.026,
    duration: 14.0,
    pan: 0.0,
  },

  // Piano desenvolve com calma sobre a cama analógica
  { t: 33.0, instrument: "felt_piano", frequencies: [369.99], velocity: 0.05, duration: 3.8, pan: -0.05 },
  { t: 35.8, instrument: "felt_piano", frequencies: [440.0], velocity: 0.052, duration: 4.0, pan: 0.0 },
  { t: 39.0, instrument: "felt_piano", frequencies: [554.37], velocity: 0.055, duration: 4.2, pan: 0.08 },
  { t: 42.5, instrument: "felt_piano", frequencies: [739.99], velocity: 0.056, duration: 5.0, pan: 0.12 }, // F#5

  // Modulação suave para Sol Maior com nona
  {
    t: 45.0,
    instrument: "analog_pad",
    frequencies: [196.0, 246.94, 293.66, 440.0], // G3, B3, D4, A4
    velocity: 0.028,
    duration: 14.0,
    pan: 0.0,
  },

  { t: 47.5, instrument: "felt_piano", frequencies: [392.0], velocity: 0.048, duration: 3.5, pan: -0.06 },
  { t: 50.0, instrument: "felt_piano", frequencies: [493.88], velocity: 0.05, duration: 3.8, pan: 0.0 },
  { t: 53.0, instrument: "felt_piano", frequencies: [587.33], velocity: 0.052, duration: 4.0, pan: 0.06 },
  { t: 56.5, instrument: "felt_piano", frequencies: [659.25], velocity: 0.055, duration: 5.0, pan: 0.1 },

  // =========================================================================
  // 3. REFLEXO [1:00 - 1:30] — PONTO DE LUZ (CELESTA & TEXTURA SHIMMER)
  // Celesta/glockenspiel muito sutil pontuando mudanças harmônicas.
  // Sensação: "há algo para descobrir".
  // =========================================================================
  {
    t: 60.0,
    instrument: "analog_pad",
    frequencies: [185.0, 246.94, 293.66, 369.99], // F#3, B3, D4, F#4 (Bm9)
    velocity: 0.025,
    duration: 15.0,
    pan: 0.0,
  },

  // Textura synth ambiente muito distante
  { t: 61.0, instrument: "synth_texture", frequencies: [880.0, 1318.51], velocity: 0.016, duration: 16.0, pan: 0.4 },

  { t: 62.0, instrument: "felt_piano", frequencies: [493.88], velocity: 0.05, duration: 4.0, pan: -0.08 },
  { t: 65.0, instrument: "felt_piano", frequencies: [554.37], velocity: 0.052, duration: 4.2, pan: 0.0 },

  // Ponto de luz da Celesta / Glockenspiel (pouquíssimas notas)
  { t: 67.5, instrument: "celesta", frequencies: [1318.51], velocity: 0.032, duration: 3.2, pan: 0.35 }, // E6

  { t: 70.0, instrument: "felt_piano", frequencies: [659.25], velocity: 0.055, duration: 4.5, pan: 0.1 },
  { t: 73.5, instrument: "felt_piano", frequencies: [554.37], velocity: 0.05, duration: 4.0, pan: 0.0 },

  // Segundo ponto cristalino na mudança harmônica
  { t: 76.0, instrument: "celesta", frequencies: [1661.22], velocity: 0.03, duration: 3.0, pan: -0.3 }, // G#6 (#11)

  { t: 78.0, instrument: "felt_piano", frequencies: [440.0], velocity: 0.048, duration: 3.8, pan: -0.05 },
  { t: 81.5, instrument: "felt_piano", frequencies: [493.88], velocity: 0.05, duration: 5.0, pan: 0.0 },
  { t: 85.0, instrument: "felt_piano", frequencies: [369.99], velocity: 0.046, duration: 5.5, pan: -0.05 },

  // =========================================================================
  // 4. EXPLORAÇÃO [1:30 - 2:05] — RESPOSTA DA KALIMBA / MALLET
  // Kalimba macia e cristalina responde nos espaços entre frases do piano.
  // Timbres orgânicos, delicados, notas espaçadas (inspiração Haggstrom).
  // =========================================================================
  {
    t: 90.0,
    instrument: "analog_pad",
    frequencies: [146.83, 220.0, 277.18, 369.99], // D3, A3, C#4, F#4 (Dmaj7)
    velocity: 0.026,
    duration: 16.0,
    pan: 0.0,
  },

  // Frase interrogativa do piano
  { t: 92.0, instrument: "felt_piano", frequencies: [293.66], velocity: 0.052, duration: 3.8, pan: -0.08 },
  { t: 94.5, instrument: "felt_piano", frequencies: [369.99], velocity: 0.054, duration: 4.0, pan: -0.02 },
  { t: 97.2, instrument: "felt_piano", frequencies: [440.0], velocity: 0.056, duration: 4.2, pan: 0.06 },

  // RESPOSTA DA KALIMBA / MALLET NO VAZIO
  { t: 99.0, instrument: "kalimba", frequencies: [739.99], velocity: 0.044, duration: 2.8, pan: 0.22 }, // F#5
  { t: 100.2, instrument: "kalimba", frequencies: [659.25], velocity: 0.042, duration: 2.8, pan: 0.2 }, // E5
  { t: 101.5, instrument: "kalimba", frequencies: [587.33], velocity: 0.04, duration: 3.2, pan: 0.25 }, // D5

  // Piano continua o diálogo
  { t: 104.0, instrument: "felt_piano", frequencies: [554.37], velocity: 0.054, duration: 3.8, pan: 0.05 },
  { t: 107.0, instrument: "felt_piano", frequencies: [659.25], velocity: 0.056, duration: 4.2, pan: 0.1 },

  // Segunda resposta delicada da Kalimba
  { t: 109.5, instrument: "kalimba", frequencies: [880.0], velocity: 0.045, duration: 2.8, pan: -0.22 }, // A5
  { t: 111.0, instrument: "kalimba", frequencies: [739.99], velocity: 0.042, duration: 3.0, pan: -0.2 }, // F#5
  { t: 112.5, instrument: "kalimba", frequencies: [554.37], velocity: 0.038, duration: 3.5, pan: -0.18 }, // C#5

  // Resolução suave do piano
  { t: 115.0, instrument: "felt_piano", frequencies: [493.88], velocity: 0.05, duration: 3.6, pan: -0.04 },
  { t: 118.0, instrument: "felt_piano", frequencies: [440.0], velocity: 0.052, duration: 4.8, pan: 0.0 },
  { t: 121.5, instrument: "celesta", frequencies: [1108.73], velocity: 0.03, duration: 3.2, pan: 0.3 }, // C#6

  // =========================================================================
  // 5. EXPANSÃO HARMÔNICA [2:05 - 2:40] — CORDAS LEVES, HARPA & SUB-BASS
  // Cordas suaves sustentadas, arpejo de harpa discreto e subgrave profundo.
  // Ponto de maior calor da jornada, sem melodrama ou clichê épico.
  // =========================================================================
  // Sub-bass eletrônico discreto (profundidade acústica sem batida)
  { t: 125.0, instrument: "sub_bass", frequencies: [36.71], velocity: 0.042, duration: 16.0, pan: 0.0 }, // D1

  // Cordas suaves sustentadas
  {
    t: 125.5,
    instrument: "strings",
    frequencies: [185.0, 220.0, 277.18, 369.99], // F#3, A3, C#4, F#4
    velocity: 0.032,
    duration: 16.0,
    pan: 0.0,
  },

  // Harpa dedilhada delicada em arpejo textural
  { t: 126.8, instrument: "harp", frequencies: [146.83], velocity: 0.034, duration: 3.5, pan: 0.2 }, // D3
  { t: 127.3, instrument: "harp", frequencies: [220.0], velocity: 0.036, duration: 3.5, pan: 0.24 }, // A3
  { t: 127.8, instrument: "harp", frequencies: [369.99], velocity: 0.038, duration: 3.6, pan: 0.28 }, // F#4
  { t: 128.3, instrument: "harp", frequencies: [554.37], velocity: 0.04, duration: 3.8, pan: 0.32 }, // C#5
  { t: 128.8, instrument: "harp", frequencies: [659.25], velocity: 0.042, duration: 4.2, pan: 0.35 }, // E5

  // Piano com o motivo pleno e acolhedor
  { t: 130.0, instrument: "felt_piano", frequencies: [293.66], velocity: 0.058, duration: 4.0, pan: -0.05 },
  { t: 132.5, instrument: "felt_piano", frequencies: [369.99], velocity: 0.06, duration: 4.2, pan: 0.0 },
  { t: 135.2, instrument: "felt_piano", frequencies: [440.0], velocity: 0.062, duration: 4.5, pan: 0.05 },
  { t: 138.5, instrument: "felt_piano", frequencies: [659.25], velocity: 0.065, duration: 5.0, pan: 0.1 },
  { t: 142.0, instrument: "felt_piano", frequencies: [880.0], velocity: 0.062, duration: 5.5, pan: 0.05 }, // A5 (iluminação serena)

  // Celesta chime com a harpa
  { t: 139.0, instrument: "celesta", frequencies: [1318.51], velocity: 0.034, duration: 3.5, pan: 0.28 },

  // Segunda frase da expansão: Sol Maior / Si Menor
  { t: 143.0, instrument: "sub_bass", frequencies: [49.0], velocity: 0.04, duration: 15.0, pan: 0.0 }, // G1
  {
    t: 143.5,
    instrument: "strings",
    frequencies: [196.0, 246.94, 293.66, 440.0],
    velocity: 0.034,
    duration: 15.0,
    pan: 0.0,
  },

  // Harpa cascata descendente
  { t: 144.5, instrument: "harp", frequencies: [880.0], velocity: 0.036, duration: 3.2, pan: -0.22 },
  { t: 145.0, instrument: "harp", frequencies: [739.99], velocity: 0.034, duration: 3.2, pan: -0.24 },
  { t: 145.5, instrument: "harp", frequencies: [587.33], velocity: 0.032, duration: 3.4, pan: -0.26 },
  { t: 146.0, instrument: "harp", frequencies: [440.0], velocity: 0.03, duration: 3.6, pan: -0.28 },

  // Kalimba eco suave
  { t: 148.0, instrument: "kalimba", frequencies: [587.33], velocity: 0.038, duration: 3.2, pan: 0.18 },
  { t: 149.5, instrument: "kalimba", frequencies: [493.88], velocity: 0.036, duration: 3.4, pan: 0.15 },

  { t: 152.0, instrument: "felt_piano", frequencies: [739.99], velocity: 0.055, duration: 3.8, pan: 0.08 },
  { t: 154.8, instrument: "felt_piano", frequencies: [587.33], velocity: 0.052, duration: 4.2, pan: 0.0 },
  { t: 157.5, instrument: "felt_piano", frequencies: [440.0], velocity: 0.048, duration: 4.8, pan: -0.05 },

  // =========================================================================
  // 6. CONTEMPLAÇÃO [2:40 - 3:10] — RECOLHIMENTO DAS CAMADAS
  // As cordas e a harpa retiram-se lentamente. A kalimba dá seu último toque.
  // =========================================================================
  {
    t: 162.0,
    instrument: "analog_pad",
    frequencies: [146.83, 220.0, 293.66],
    velocity: 0.024,
    duration: 16.0,
    pan: 0.0,
  },

  { t: 164.0, instrument: "felt_piano", frequencies: [493.88], velocity: 0.05, duration: 4.0, pan: -0.06 },
  { t: 167.0, instrument: "felt_piano", frequencies: [440.0], velocity: 0.052, duration: 4.2, pan: 0.0 },

  // Última resposta suave da kalimba
  { t: 169.5, instrument: "kalimba", frequencies: [659.25], velocity: 0.036, duration: 3.0, pan: 0.15 },
  { t: 171.0, instrument: "kalimba", frequencies: [554.37], velocity: 0.034, duration: 3.2, pan: 0.12 },
  { t: 172.5, instrument: "kalimba", frequencies: [440.0], velocity: 0.032, duration: 3.5, pan: 0.1 },

  { t: 175.0, instrument: "felt_piano", frequencies: [369.99], velocity: 0.048, duration: 4.0, pan: -0.04 },
  { t: 178.5, instrument: "felt_piano", frequencies: [440.0], velocity: 0.046, duration: 4.2, pan: 0.0 },
  { t: 182.0, instrument: "felt_piano", frequencies: [329.63], velocity: 0.044, duration: 5.0, pan: 0.0 },

  // Sopro de textura analógica esvaindo-se
  { t: 184.0, instrument: "synth_texture", frequencies: [587.33, 880.0], velocity: 0.014, duration: 12.0, pan: -0.3 },

  // =========================================================================
  // 7. RETORNO & LOOP PERFEITO [3:10 - 3:30] — CURIOSIDADE RENOVADA
  // Piano e ambiência final com harmonia aberta que se conecta de volta à Intro.
  // =========================================================================
  { t: 191.0, instrument: "felt_piano", frequencies: [293.66], velocity: 0.048, duration: 4.5, pan: -0.05 }, // D4
  { t: 194.0, instrument: "felt_piano", frequencies: [369.99], velocity: 0.045, duration: 4.2, pan: 0.0 }, // F#4
  { t: 197.0, instrument: "felt_piano", frequencies: [440.0], velocity: 0.046, duration: 4.5, pan: 0.05 }, // A4
  { t: 200.5, instrument: "felt_piano", frequencies: [659.25], velocity: 0.048, duration: 5.0, pan: 0.08 }, // E5

  // Acorde final aberto Dadd9 suspenso em decaimento natural perfeito
  {
    t: 204.0,
    instrument: "felt_piano",
    frequencies: [146.83, 220.0, 369.99, 554.37], // D3, A3, F#4, C#5 (aberto e luminoso)
    velocity: 0.042,
    duration: 5.8,
    pan: 0.0,
  },

  // 205s a 210s: Cauda longa de reverberação e eco suave.
  // Aos 210s, o ciclo reinicia no silêncio e na primeira nota de 3.0s com naturalidade total.
];
