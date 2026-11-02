/**
 * CALDRA ORGANIC LIGHT FIELD — Motor Autônomo de Massas de Luz Vivas
 *
 * Características:
 *  - Massas 100% autônomas flutuando e navegando livremente em espaço 2D.
 *  - ZERO rotação angular em torno do centro (sem efeito catavento, hélice ou vórtice).
 *  - Cada massa possui seu próprio vetor de deslocamento de longo alcance (Ponto A → Ponto B → Ponto C).
 *  - Curvatura suave e orgânica via splines Bézier com aceleração e desaceleração naturais.
 *  - Cobertura completa de 100% da viewport (cantos, bordas, centro, diagonais e travessias completas).
 *  - Entrada e saída suave pelas bordas (-12% a 115%).
 *  - Fusão e separação naturais: ao cruzarem trajetórias próximas, os halos se fundem e expandem
 *    suavemente em escala, sem sofrer giro angular ou empurrão artificial.
 *  - 100% desacoplado do ciclo de render do React: 0 re-renders, mutações diretas
 *    no compositor GPU dos 5 nós DOM persistentes.
 */

export interface AutonomousFieldRefs {
  container: HTMLElement | null;
  delta: HTMLElement | null;
  beta: HTMLElement | null;
  alpha: HTMLElement | null;
  gama: HTMLElement | null;
  epsilon: HTMLElement | null;
}

interface MassVoyage {
  id: string;
  widthVmax: number;
  heightVmax: number;
  // Coordenadas da perna atual em espaço normalizado da tela [-0.12, 1.15]
  p0x: number;
  p0y: number;
  p1x: number; // ponto de controle da curva Bézier
  p1y: number;
  p2x: number; // destino final da perna
  p2y: number;
  // Temporização e progresso
  legElapsed: number;
  legDuration: number;
  lingerElapsed: number;
  lingerDuration: number;
  isLingering: boolean;
  // Posição atual calculada
  currentX: number;
  currentY: number;
  // Parâmetros de micro-ondulação orgânica independente
  noisePhaseX: number;
  noisePhaseY: number;
  noiseSpeed: number;
  noiseAmp: number;
  // Expansão elástica suave durante fusão com outra massa
  proximityScale: number;
  // Escala gradual do estado de processamento de IA (sem saltos de layout)
  aiScale: number;
  // Elemento DOM
  element: HTMLElement;
}

interface MassPlaneConfig {
  id: string;
  widthVmax: number;
  heightVmax: number;
  startX: number;
  startY: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  cycleDurationSec: number; // 18s, 23s, 29s, 34s, 41s
  initialPhaseOffsetSec: number; // negative delay equivalente (-5s, -11s, -17s, -23s, -31s)
  breathPeriodSec: number;
  noiseSpeed: number;
  noiseAmp: number;
}

const MASS_PLANE_SPECS: MassPlaneConfig[] = [
  // PLANO 1 — Massa Protagonista (Foco Superior / Boas-vindas: halo amplo e calmo no topo)
  {
    id: "alpha",
    widthVmax: 78,
    heightVmax: 64,
    startX: 0.34,
    startY: 0.16,
    xMin: 0.08,
    xMax: 0.92,
    yMin: -0.06,
    yMax: 0.46,
    cycleDurationSec: 34,
    initialPhaseOffsetSec: 23,
    breathPeriodSec: 34,
    noiseSpeed: 0.18,
    noiseAmp: 0.022,
  },
  // PLANO 1 (Auxiliar Superior) — Centelha Dourada/Celeste no quadrante superior
  {
    id: "epsilon",
    widthVmax: 44,
    heightVmax: 36,
    startX: 0.72,
    startY: 0.14,
    xMin: 0.12,
    xMax: 0.94,
    yMin: -0.04,
    yMax: 0.44,
    cycleDurationSec: 18,
    initialPhaseOffsetSec: 5,
    breathPeriodSec: 18,
    noiseSpeed: 0.32,
    noiseAmp: 0.028,
  },
  // PLANO 2 — Massas de Ritmo e Transição (Zona Central / Especialização nas laterais e diagonais)
  {
    id: "beta",
    widthVmax: 62,
    heightVmax: 52,
    startX: 0.18,
    startY: 0.50,
    xMin: -0.04,
    xMax: 0.88,
    yMin: 0.24,
    yMax: 0.78,
    cycleDurationSec: 23,
    initialPhaseOffsetSec: 11,
    breathPeriodSec: 23,
    noiseSpeed: 0.22,
    noiseAmp: 0.024,
  },
  {
    id: "gama",
    widthVmax: 58,
    heightVmax: 48,
    startX: 0.82,
    startY: 0.54,
    xMin: 0.12,
    xMax: 1.04,
    yMin: 0.26,
    yMax: 0.80,
    cycleDurationSec: 29,
    initialPhaseOffsetSec: 17,
    breathPeriodSec: 29,
    noiseSpeed: 0.20,
    noiseAmp: 0.024,
  },
  // PLANO 3 — Massa de Ancoragem Profunda (Base / Continue Trabalhando e Dock inferior)
  {
    id: "delta",
    widthVmax: 92,
    heightVmax: 58,
    startX: 0.50,
    startY: 0.88,
    xMin: 0.10,
    xMax: 0.90,
    yMin: 0.62,
    yMax: 1.06,
    cycleDurationSec: 41,
    initialPhaseOffsetSec: 31,
    breathPeriodSec: 41,
    noiseSpeed: 0.14,
    noiseAmp: 0.018,
  },
];

function findSpec(entityId: string): MassPlaneConfig {
  return MASS_PLANE_SPECS.find((s) => s.id === entityId) ?? MASS_PLANE_SPECS[0]!;
}

function pickNextWaypoint(
  currentX: number,
  currentY: number,
  isProcessing: boolean,
  entityId: string
): { p2x: number; p2y: number; p1x: number; p1y: number; duration: number; linger: number } {
  const spec = findSpec(entityId);
  let targetX = 0;
  let targetY = 0;

  if (isProcessing && (entityId === "alpha" || entityId === "beta" || entityId === "epsilon")) {
    // Modo de processamento: massas superiores viajam suavemente pela metade superior
    targetX = 0.06 + Math.random() * 0.88;
    targetY = -0.04 + Math.random() * 0.36;
  } else {
    // Deslocamento autônomo respeitando a narrativa espacial dos 3 planos de profundidade
    let attempts = 0;
    const minSpan = Math.min(spec.xMax - spec.xMin, spec.yMax - spec.yMin) * 0.36;
    do {
      targetX = spec.xMin + Math.random() * (spec.xMax - spec.xMin);
      targetY = spec.yMin + Math.random() * (spec.yMax - spec.yMin);
      attempts++;
    } while (attempts < 12 && Math.hypot(targetX - currentX, targetY - currentY) < minSpan);
  }

  // Ponto de controle P1 intermediário para gerar arco curvo suave e orgânico
  const midX = (currentX + targetX) * 0.5;
  const midY = (currentY + targetY) * 0.5;

  const dx = targetX - currentX;
  const dy = targetY - currentY;
  const dist = Math.hypot(dx, dy);

  // Vetor perpendicular normalizado
  const len = dist > 0.001 ? dist : 1;
  const nx = -dy / len;
  const ny = dx / len;

  // Curvatura com sinal aleatório e amplitude suave (16% a 30% da distância)
  const sign = Math.random() < 0.5 ? -1 : 1;
  const curveMagnitude = dist * (0.16 + Math.random() * 0.14) * sign;

  const p1x = midX + nx * curveMagnitude;
  const p1y = midY + ny * curveMagnitude;

  // Duração baseada no ciclo primo/descompassado da massa (18s, 23s, 29s, 34s, 41s)
  const duration = spec.cycleDurationSec * (0.88 + Math.random() * 0.24);
  const linger = 0.8 + Math.random() * 1.8;

  return { p2x: targetX, p2y: targetY, p1x, p1y, duration, linger };
}

export interface AutonomousFieldController {
  stop: () => void;
  update: (opts: { isAnimated?: boolean; isProcessing?: boolean }) => void;
}

/**
 * Easing senoidal puro contínuo equivalente a cubic-bezier(0.37, 0, 0.63, 1)
 */
function easeSineInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function startAutonomousField(
  refs: AutonomousFieldRefs,
  options: { isAnimated: boolean; isProcessing: boolean }
): AutonomousFieldController {
  const container = refs.container;
  if (!container) {
    return {
      stop: () => {},
      update: () => {},
    };
  }

  const elementsMap: Record<string, HTMLElement | null> = {
    delta: refs.delta,
    beta: refs.beta,
    alpha: refs.alpha,
    gama: refs.gama,
    epsilon: refs.epsilon,
  };

  let currentIsAnimated = options.isAnimated;
  let currentIsProcessing = options.isProcessing;

  const voyages: (MassVoyage & { breathPeriodSec: number; phaseOffsetSec: number })[] = [];

  for (const s of MASS_PLANE_SPECS) {
    const el = elementsMap[s.id];
    if (!el) continue;

    const wp = pickNextWaypoint(s.startX, s.startY, currentIsProcessing, s.id);
    // Aplica o descompasso inicial (equivalente a animation-delay negativo) para evitar repetição mecânica
    const initialProgress = (s.initialPhaseOffsetSec % wp.duration) / wp.duration;
    const initEased = easeSineInOut(initialProgress);
    const initX =
      (1 - initEased) * (1 - initEased) * s.startX +
      2 * (1 - initEased) * initEased * wp.p1x +
      initEased * initEased * wp.p2x;
    const initY =
      (1 - initEased) * (1 - initEased) * s.startY +
      2 * (1 - initEased) * initEased * wp.p1y +
      initEased * initEased * wp.p2y;

    voyages.push({
      id: s.id,
      widthVmax: s.widthVmax,
      heightVmax: s.heightVmax,
      p0x: s.startX,
      p0y: s.startY,
      p1x: wp.p1x,
      p1y: wp.p1y,
      p2x: wp.p2x,
      p2y: wp.p2y,
      legElapsed: initialProgress * wp.duration,
      legDuration: wp.duration,
      lingerElapsed: 0,
      lingerDuration: wp.linger,
      isLingering: false,
      currentX: initX,
      currentY: initY,
      noisePhaseX: s.initialPhaseOffsetSec * 0.7,
      noisePhaseY: s.initialPhaseOffsetSec * 1.3,
      noiseSpeed: s.noiseSpeed,
      noiseAmp: s.noiseAmp,
      proximityScale: 1.0,
      aiScale: 1.0,
      breathPeriodSec: s.breathPeriodSec,
      phaseOffsetSec: s.initialPhaseOffsetSec,
      element: el,
    });
  }

  if (voyages.length === 0) {
    return {
      stop: () => {},
      update: () => {},
    };
  }

  let animId = 0;
  let lastTime = performance.now();
  let totalTime = 0;
  let isRunning = true;

  const frame = (now: number) => {
    if (!isRunning) return;

    let dt = (now - lastTime) / 1000;
    lastTime = now;

    if (dt > 0.1) dt = 0.1;
    if (dt < 0.001) dt = 0.001;

    totalTime += dt;

    const width = container.clientWidth || window.innerWidth || 1000;
    const height = container.clientHeight || window.innerHeight || 800;
    const vmax = Math.max(width, height);

    if (currentIsAnimated) {
      // 1. Atualizar trajetórias Bézier de cada massa com easing senoidal puro cubic-bezier(0.37, 0, 0.63, 1)
      for (const v of voyages) {
        if (v.isLingering) {
          v.lingerElapsed += dt;

          // Micro-respiração no local durante a transição suave de estágio
          const nx = Math.sin((totalTime + v.phaseOffsetSec) * v.noiseSpeed + v.noisePhaseX) * v.noiseAmp;
          const ny = Math.cos((totalTime + v.phaseOffsetSec) * v.noiseSpeed * 0.8 + v.noisePhaseY) * v.noiseAmp;
          v.currentX = v.p2x + nx;
          v.currentY = v.p2y + ny;

          if (v.lingerElapsed >= v.lingerDuration) {
            v.isLingering = false;
            v.p0x = v.p2x;
            v.p0y = v.p2y;
            const nextWp = pickNextWaypoint(v.p0x, v.p0y, currentIsProcessing, v.id);
            v.p1x = nextWp.p1x;
            v.p1y = nextWp.p1y;
            v.p2x = nextWp.p2x;
            v.p2y = nextWp.p2y;
            v.legElapsed = 0;
            v.legDuration = nextWp.duration;
            v.lingerDuration = nextWp.linger;
          }
        } else {
          v.legElapsed += dt;
          const t = Math.min(1.0, v.legElapsed / v.legDuration);

          // Senoide pura contínua (equivalente a cubic-bezier(0.37, 0, 0.63, 1))
          const s = easeSineInOut(t);

          // Curva Bézier quadrática contínua
          const bx = (1 - s) * (1 - s) * v.p0x + 2 * (1 - s) * s * v.p1x + s * s * v.p2x;
          const by = (1 - s) * (1 - s) * v.p0y + 2 * (1 - s) * s * v.p1y + s * s * v.p2y;

          // Micro-ondulação orgânica sobreposta
          const nx = Math.sin((totalTime + v.phaseOffsetSec) * v.noiseSpeed + v.noisePhaseX) * v.noiseAmp;
          const ny = Math.cos((totalTime + v.phaseOffsetSec) * v.noiseSpeed * 0.8 + v.noisePhaseY) * v.noiseAmp;

          v.currentX = bx + nx;
          v.currentY = by + ny;

          if (t >= 1.0) {
            v.isLingering = true;
            v.lingerElapsed = 0;
          }
        }
      }

      // 2. Fusão e expansão luminosa suave quando massas autônomas se aproximam
      for (let i = 0; i < voyages.length; i++) {
        for (let j = i + 1; j < voyages.length; j++) {
          const a = voyages[i]!;
          const b = voyages[j]!;
          const dx = b.currentX - a.currentX;
          const dy = b.currentY - a.currentY;
          const dist = Math.hypot(dx, dy);
          const fusionRadius = 0.36;

          if (dist < fusionRadius && dist > 0.001) {
            const proximity = 1.0 - dist / fusionRadius;
            const targetScale = 1.0 + proximity * 0.08;
            if (targetScale > a.proximityScale) a.proximityScale = targetScale;
            if (targetScale > b.proximityScale) b.proximityScale = targetScale;
          }
        }
      }

      // 3. Relaxamento elástico da escala após separação e escala gradual de IA
      for (const v of voyages) {
        v.proximityScale += (1.0 - v.proximityScale) * Math.min(1.0, dt * 1.6);
        const targetAi =
          currentIsProcessing && (v.id === "alpha" || v.id === "beta" || v.id === "epsilon")
            ? 1.06
            : 1.0;
        v.aiScale += (targetAi - v.aiScale) * Math.min(1.0, dt * 1.4);
      }
    }

    // 4. Aplicação direta no compositor GPU (translate3d + respiração escalar 0.92..1.12)
    for (const v of voyages) {
      const massW = (v.widthVmax * vmax) / 100;
      const massH = (v.heightVmax * vmax) / 100;

      const px = v.currentX * width - massW * 0.5;
      const py = v.currentY * height - massH * 0.5;

      // Respiração escalar senoidal individual (0.92 a 1.12 -> centro 1.02 ± 0.10)
      const breathPhase = ((totalTime + v.phaseOffsetSec) * Math.PI * 2) / v.breathPeriodSec;
      const breathScale = 1.02 + 0.10 * Math.sin(breathPhase);
      const finalScale = (breathScale * v.proximityScale * v.aiScale).toFixed(3);

      v.element.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) scale(${finalScale})`;
    }

    animId = requestAnimationFrame(frame);
  };

  animId = requestAnimationFrame(frame);

  return {
    stop: () => {
      isRunning = false;
      cancelAnimationFrame(animId);
    },
    update: (opts: { isAnimated?: boolean; isProcessing?: boolean }) => {
      if (opts.isAnimated !== undefined) {
        currentIsAnimated = opts.isAnimated;
      }
      if (opts.isProcessing !== undefined && opts.isProcessing !== currentIsProcessing) {
        currentIsProcessing = opts.isProcessing;

        for (const v of voyages) {
          v.p0x = v.currentX;
          v.p0y = v.currentY;
          const nextWp = pickNextWaypoint(v.p0x, v.p0y, currentIsProcessing, v.id);
          v.p1x = nextWp.p1x;
          v.p1y = nextWp.p1y;
          v.p2x = nextWp.p2x;
          v.p2y = nextWp.p2y;
          v.legElapsed = 0;
          v.legDuration = currentIsProcessing ? nextWp.duration * 0.75 : nextWp.duration;
          v.lingerDuration = nextWp.linger;
          v.isLingering = false;
        }
      }
    },
  };
}
