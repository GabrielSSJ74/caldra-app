/**
 * CALDRA AUDIO SYSTEM — PS2-INSPIRED TECHNOLOGICAL SOUND ENGINE
 *
 * Características da Identidade Sonora da CALDRA:
 * - Minimalista, tecnológica, espacial, elegante, nostálgica e imersiva.
 * - Síntese analítica procedural com Web Audio API nativa:
 *   - 0 KB de downloads adicionais, latência zero, 100% confiável e offline.
 *   - Sem dependência de arquivos externos ou quebra de autoplay.
 *   - AudioContext unificado com desbloqueio automático no primeiro gesto do usuário.
 *   - Trilha ambiente contínua com pads suaves, acordes espaciais flutuantes e texturas digitais sutis.
 *   - Efeitos táteis de alta precisão para botões, navegação, operações CAD, B-Rep e metrologia.
 */

import {
  CALDRA_MOVEMENTS,
  CALDRA_SCORE,
  TOTAL_SUITE_DURATION,
  type MovementDescriptor,
  type ScoreEvent,
} from "./CaldraSuite";

export type AudioCategory = "ui" | "cad" | "music" | "selection";

export type SoundEffectId =
  // Botões & Interface Geral
  | "ui_click"
  | "ui_select"
  | "ui_action"
  | "ui_nav"
  | "ui_toggle_open"
  | "ui_toggle_close"
  // Handpan Acústico (Nova camada sonora orgânica)
  | "handpan_ding"
  // CHAMFER & CAD Core
  | "chamfer_init"
  | "cad_core_init"
  | "kernel_loading"
  | "kernel_success"
  | "kernel_error"
  // Operações CAD
  | "cad_create"
  | "cad_move"
  | "cad_rotate"
  | "cad_copy"
  | "cad_delete"
  | "cad_join"
  | "cad_cut"
  | "cad_extrude"
  | "cad_apply"
  | "cad_undo"
  | "cad_redo"
  | "cad_gizmo"
  | "cad_reset"
  | "cad_measure"
  // Seleção
  | "cad_select_face"
  | "cad_select_edge"
  | "cad_select_vertex"
  // Planificação & Transformação
  | "planify_sequence"
  // Exportação
  | "export_start"
  | "export_success"
  | "export_error"
  // Notificações
  | "notify_success"
  | "notify_warning"
  | "notify_error";

export interface AudioSettingsState {
  masterVolume: number; // 0.0 a 1.0
  musicVolume: number; // Padrão: 0.20 (20%)
  effectsVolume: number; // Padrão: 0.25 (25%)
  uiVolume: number; // Padrão: 0.30 (30%)
  isMuted: boolean;
  uiSoundsEnabled: boolean;
  cadEffectsEnabled: boolean;
  musicEnabled: boolean;
  selectionSoundsEnabled: boolean;
  currentMovementIndex?: number;
  currentMovementName?: string;
  musicTimeSeconds?: number;
  totalSuiteDuration?: number;
}

const STORAGE_KEY = "caldra.audio_settings";

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsState = {
  masterVolume: 0.8,
  musicVolume: 0.2, // 20%
  effectsVolume: 0.25, // 25%
  uiVolume: 0.3, // 30%
  isMuted: false,
  uiSoundsEnabled: true,
  cadEffectsEnabled: true,
  musicEnabled: true,
  selectionSoundsEnabled: true,
  currentMovementIndex: 0,
  currentMovementName: "Intro — Curiosidade",
  musicTimeSeconds: 0,
  totalSuiteDuration: TOTAL_SUITE_DURATION,
};

export class AudioManager {
  private static instance: AudioManager | null = null;

  private ctx: AudioContext | null = null;
  private isUnlocked = false;

  // Barramentos de Ganho (Mixer Hierárquico)
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private uiGain: GainNode | null = null;

  // Estado Atual
  private settings: AudioSettingsState = { ...DEFAULT_AUDIO_SETTINGS };
  private listeners: Set<(s: AudioSettingsState) => void> = new Set();

  // Motor da Trilha Sonora Original CALDRA ("The Geometry of Discovery")
  private isMusicPlaying = false;
  private suiteStartTime = 0;
  private suiteUpdateTimer: number | null = null;
  private suiteLoopTimer: number | null = null;
  private activeVoices: { oscs: (OscillatorNode | AudioBufferSourceNode)[]; gain: GainNode }[] = [];
  private musicDelayNode: DelayNode | null = null;
  private musicFeedbackGain: GainNode | null = null;
  private handpanReverbNode: DelayNode | null = null;
  private handpanFeedbackGain: GainNode | null = null;

  private constructor() {
    this.loadSettings();
    this.setupUnlockListeners();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /** Atalho estático para tocar efeitos sonoros */
  public static play(soundId: SoundEffectId): void {
    AudioManager.getInstance().play(soundId);
  }

  /** Atalho estático para iniciar trilha ambiente */
  public static playMusic(trackId = "caldra_suite"): void {
    AudioManager.getInstance().playMusic(trackId);
  }

  /** Atalho estático para parar a trilha ambiente */
  public static stopMusic(): void {
    AudioManager.getInstance().stopMusic();
  }

  /** Atalho estático para saltar para um movimento da suíte (0 a 6) */
  public static seekMovement(index: number): void {
    AudioManager.getInstance().seekMovement(index);
  }

  /** Retorna os movimentos narrativos da suíte */
  public static getMovements(): MovementDescriptor[] {
    return CALDRA_MOVEMENTS;
  }

  // =========================================================================
  // INICIALIZAÇÃO E RESPEITO AO AUTOPLAY
  // =========================================================================

  private setupUnlockListeners(): void {
    if (typeof window === "undefined") return;

    const unlock = () => {
      this.ensureAudioContext();
      if (this.ctx && this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      this.isUnlocked = true;

      // Se a música estiver habilitada e ainda não iniciada, inicia suavemente
      if (this.settings.musicEnabled && !this.settings.isMuted && !this.isMusicPlaying) {
        this.playMusic("caldra_main");
      }

      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true, passive: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) return null;

      try {
        this.ctx = new AudioCtxClass();

        // Cria nós do mixer
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.effectsGain = this.ctx.createGain();
        this.uiGain = this.ctx.createGain();

        // Conexões
        this.musicGain.connect(this.masterGain);
        this.effectsGain.connect(this.masterGain);
        this.uiGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Barramento de delay estéreo espacial para a música de exploração ("CALDRA Horizon")
        try {
          this.musicDelayNode = this.ctx.createDelay();
          this.musicDelayNode.delayTime.setValueAtTime(0.28, this.ctx.currentTime);
          this.musicFeedbackGain = this.ctx.createGain();
          this.musicFeedbackGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

          const delayFilter = this.ctx.createBiquadFilter();
          delayFilter.type = "lowpass";
          delayFilter.frequency.setValueAtTime(2800, this.ctx.currentTime);

          this.musicDelayNode.connect(delayFilter);
          delayFilter.connect(this.musicFeedbackGain);
          this.musicFeedbackGain.connect(this.musicDelayNode);
          delayFilter.connect(this.musicGain);
        } catch (delayErr) {
          void delayErr;
        }

        // Barramento de ressonância acústica espacial para o Handpan (reverb quente, orgânico e celestial)
        try {
          this.handpanReverbNode = this.ctx.createDelay();
          this.handpanReverbNode.delayTime.setValueAtTime(0.38, this.ctx.currentTime);
          this.handpanFeedbackGain = this.ctx.createGain();
          this.handpanFeedbackGain.gain.setValueAtTime(0.36, this.ctx.currentTime);

          const handpanDampingFilter = this.ctx.createBiquadFilter();
          handpanDampingFilter.type = "lowpass";
          handpanDampingFilter.frequency.setValueAtTime(2200, this.ctx.currentTime);
          handpanDampingFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

          this.handpanReverbNode.connect(handpanDampingFilter);
          handpanDampingFilter.connect(this.handpanFeedbackGain);
          this.handpanFeedbackGain.connect(this.handpanReverbNode);
          handpanDampingFilter.connect(this.musicGain);
        } catch (reverbErr) {
          void reverbErr;
        }

        // Aplica volumes salvos
        this.updateGainNodes();
      } catch (err) {
        console.warn("[AudioManager] Falha ao inicializar AudioContext:", err);
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  // =========================================================================
  // GERENCIAMENTO DE ESTADO E PERSISTÊNCIA
  // =========================================================================

  private loadSettings(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...parsed };
      }
    } catch {
      this.settings = { ...DEFAULT_AUDIO_SETTINGS };
    }
  }

  private saveSettings(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (err) {
      void err;
    }
    this.notify();
    this.updateGainNodes();
  }

  private updateGainNodes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const master = this.settings.isMuted ? 0 : Math.max(0, Math.min(1, this.settings.masterVolume));
    const music = this.settings.musicEnabled ? this.settings.musicVolume : 0;
    const effects = this.settings.cadEffectsEnabled ? this.settings.effectsVolume : 0;
    const ui = this.settings.uiSoundsEnabled ? this.settings.uiVolume : 0;

    this.masterGain?.gain.setTargetAtTime(master, now, 0.05);
    this.musicGain?.gain.setTargetAtTime(music, now, 0.05);
    this.effectsGain?.gain.setTargetAtTime(effects, now, 0.05);
    this.uiGain?.gain.setTargetAtTime(ui, now, 0.05);
  }

  public getSettings(): AudioSettingsState {
    return { ...this.settings };
  }

  public subscribe(listener: (s: AudioSettingsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const s = this.getSettings();
    this.listeners.forEach((l) => l(s));
  }

  // =========================================================================
  // MÉTODOS DE CONTROLE DE VOLUME
  // =========================================================================

  public setMasterVolume(vol: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.settings.masterVolume > 0 && this.settings.isMuted) {
      this.settings.isMuted = false;
    }
    this.saveSettings();
  }

  public setMusicVolume(vol: number): void {
    this.settings.musicVolume = Math.max(0, Math.min(1, vol));
    this.saveSettings();
  }

  public setEffectsVolume(vol: number): void {
    this.settings.effectsVolume = Math.max(0, Math.min(1, vol));
    this.saveSettings();
  }

  public setUiVolume(vol: number): void {
    this.settings.uiVolume = Math.max(0, Math.min(1, vol));
    this.saveSettings();
  }

  public toggleMute(): boolean {
    this.settings.isMuted = !this.settings.isMuted;
    this.saveSettings();
    if (!this.settings.isMuted && this.settings.musicEnabled && !this.isMusicPlaying) {
      this.playMusic();
    }
    return this.settings.isMuted;
  }

  public setSilentMode(silent: boolean): void {
    this.settings.isMuted = silent;
    this.saveSettings();
  }

  public setVolumePreset(preset: "mute" | "low" | "mid" | "high"): void {
    switch (preset) {
      case "mute":
        this.settings.isMuted = true;
        break;
      case "low":
        this.settings.isMuted = false;
        this.settings.masterVolume = 0.3;
        break;
      case "mid":
        this.settings.isMuted = false;
        this.settings.masterVolume = 0.65;
        break;
      case "high":
        this.settings.isMuted = false;
        this.settings.masterVolume = 1.0;
        break;
    }
    this.saveSettings();
  }

  public toggleUiSounds(): void {
    this.settings.uiSoundsEnabled = !this.settings.uiSoundsEnabled;
    this.saveSettings();
    if (this.settings.uiSoundsEnabled) this.play("ui_click");
  }

  public toggleCadEffects(): void {
    this.settings.cadEffectsEnabled = !this.settings.cadEffectsEnabled;
    this.saveSettings();
    if (this.settings.cadEffectsEnabled) this.play("cad_core_init");
  }

  public toggleMusic(): void {
    this.settings.musicEnabled = !this.settings.musicEnabled;
    this.saveSettings();
    if (this.settings.musicEnabled) {
      this.playMusic();
    } else {
      this.stopMusic();
    }
  }

  public toggleSelectionSounds(): void {
    this.settings.selectionSoundsEnabled = !this.settings.selectionSoundsEnabled;
    this.saveSettings();
    if (this.settings.selectionSoundsEnabled) this.play("cad_select_face");
  }

  // =========================================================================
  // REPRODUÇÃO DE EFEITOS SONOROS (PROCEDURAL SINTETIZADO PS2 AESTHETIC)
  // =========================================================================

  public play(soundId: SoundEffectId): void {
    if (this.settings.isMuted) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    // Roteamento por categoria e checagem de habilitação
    let targetBus: GainNode | null = this.uiGain;
    if (soundId.startsWith("cad_") || soundId.startsWith("kernel_") || soundId === "chamfer_init" || soundId === "planify_sequence") {
      if (soundId.startsWith("cad_select_")) {
        if (!this.settings.selectionSoundsEnabled) return;
        targetBus = this.effectsGain;
      } else {
        if (!this.settings.cadEffectsEnabled) return;
        targetBus = this.effectsGain;
      }
    } else if (soundId.startsWith("export_") || soundId.startsWith("notify_")) {
      targetBus = this.effectsGain;
    } else {
      if (!this.settings.uiSoundsEnabled) return;
      targetBus = this.uiGain;
    }

    if (!targetBus) return;

    try {
      const now = ctx.currentTime;

      switch (soundId) {
        // ---------------------------------------------------------------
        // 1. BOTÃO NORMAL — "click" eletrônico suave (50-100 ms)
        // ---------------------------------------------------------------
        case "ui_click": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          // Variação micro tonal de pitch (evita efeito metralhadora)
          const pitchJitter = 1 + (Math.random() - 0.5) * 0.08;
          osc.type = "sine";
          osc.frequency.setValueAtTime(1450 * pitchJitter, now);
          osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);

          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1100, now);
          filter.Q.setValueAtTime(3.5, now);

          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(targetBus);

          osc.start(now);
          osc.stop(now + 0.07);
          break;
        }

        // ---------------------------------------------------------------
        // 2. BOTÃO SELECIONADO — Mais grave e definido (70-120 ms)
        // ---------------------------------------------------------------
        case "ui_select": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(440, now);
          osc1.frequency.exponentialRampToValueAtTime(370, now + 0.09);

          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(220, now);
          osc2.frequency.exponentialRampToValueAtTime(185, now + 0.09);

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(900, now);
          filter.Q.setValueAtTime(2, now);

          gain.gain.setValueAtTime(0.32, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

          osc1.connect(filter);
          osc2.connect(filter);
          filter.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.11);
          osc2.stop(now + 0.11);
          break;
        }

        // ---------------------------------------------------------------
        // 3. AÇÃO PRINCIPAL — Som eletrônico curto com confirmação (100-180 ms)
        // ---------------------------------------------------------------
        case "ui_action": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(587.33, now); // D5
          osc1.frequency.setValueAtTime(880, now + 0.04); // A5

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(880, now);
          osc2.frequency.setValueAtTime(1174.66, now + 0.04); // D6

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.17);
          osc2.stop(now + 0.17);
          break;
        }

        // ---------------------------------------------------------------
        // 4. TRANSIÇÃO DE NAVEGAÇÃO — Digital sweep suave (100-250 ms)
        // ---------------------------------------------------------------
        case "ui_nav": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = "triangle";
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(980, now + 0.16);

          filter.type = "bandpass";
          filter.frequency.setValueAtTime(600, now);
          filter.frequency.exponentialRampToValueAtTime(1800, now + 0.16);
          filter.Q.setValueAtTime(4, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.28, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(targetBus);

          osc.start(now);
          osc.stop(now + 0.19);
          break;
        }

        // ---------------------------------------------------------------
        // MENUS EXPANSÍVEIS: Tick Ascendente (Abrir) e Descendente (Fechar)
        // ---------------------------------------------------------------
        case "ui_toggle_open": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);

          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        case "ui_toggle_close": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1300, now);
          osc.frequency.exponentialRampToValueAtTime(720, now + 0.05);

          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        // ---------------------------------------------------------------
        // HANDPAN ACÚSTICO — Toque quente, profundo, ressonante e natural
        // ---------------------------------------------------------------
        case "handpan_ding": {
          this.triggerHandpanNote(246.94, now, 0, 0.052, 4.2, targetBus);
          break;
        }

        // ---------------------------------------------------------------
        // 5. CHAMFER — Sequência curta de inicialização CAD (~450 ms)
        // Pulso eletrônico -> Pequeno sweep -> Confirmação suave
        // ---------------------------------------------------------------
        case "chamfer_init": {
          // Fase 1: Pulso sub grave de abertura (0ms - 100ms)
          const sub = ctx.createOscillator();
          const subGain = ctx.createGain();
          sub.type = "sine";
          sub.frequency.setValueAtTime(85, now);
          sub.frequency.exponentialRampToValueAtTime(50, now + 0.12);
          subGain.gain.setValueAtTime(0.3, now);
          subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
          sub.connect(subGain);
          subGain.connect(targetBus);
          sub.start(now);
          sub.stop(now + 0.13);

          // Fase 2: Sweep de escaneamento digital (100ms - 260ms)
          const sweep = ctx.createOscillator();
          const sweepGain = ctx.createGain();
          const sweepFilter = ctx.createBiquadFilter();
          sweep.type = "sawtooth";
          sweep.frequency.setValueAtTime(320, now + 0.1);
          sweep.frequency.exponentialRampToValueAtTime(1150, now + 0.25);
          sweepFilter.type = "lowpass";
          sweepFilter.frequency.setValueAtTime(800, now + 0.1);
          sweepFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.25);
          sweepFilter.Q.setValueAtTime(3.5, now + 0.1);

          sweepGain.gain.setValueAtTime(0.001, now + 0.1);
          sweepGain.gain.linearRampToValueAtTime(0.18, now + 0.16);
          sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);

          sweep.connect(sweepFilter);
          sweepFilter.connect(sweepGain);
          sweepGain.connect(targetBus);
          sweep.start(now + 0.1);
          sweep.stop(now + 0.28);

          // Fase 3: Confirmação harmônica cristalina (260ms - 460ms)
          const chord1 = ctx.createOscillator();
          const chord2 = ctx.createOscillator();
          const chordGain = ctx.createGain();

          chord1.type = "sine";
          chord1.frequency.setValueAtTime(659.25, now + 0.26); // E5
          chord2.type = "sine";
          chord2.frequency.setValueAtTime(987.77, now + 0.26); // B5

          chordGain.gain.setValueAtTime(0.001, now + 0.26);
          chordGain.gain.linearRampToValueAtTime(0.24, now + 0.29);
          chordGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

          chord1.connect(chordGain);
          chord2.connect(chordGain);
          chordGain.connect(targetBus);

          chord1.start(now + 0.26);
          chord2.start(now + 0.26);
          chord1.stop(now + 0.49);
          chord2.stop(now + 0.49);
          break;
        }

        // ---------------------------------------------------------------
        // 6. CAD CORE 3D & CAD KERNEL
        // ---------------------------------------------------------------
        case "cad_core_init": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.setValueAtTime(784, now + 0.05); // G5
          osc.frequency.setValueAtTime(1046.5, now + 0.1); // C6

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.3, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.29);
          break;
        }

        case "kernel_loading": {
          // Processamento discreto
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);

          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case "kernel_success": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(880, now);
          osc1.frequency.setValueAtTime(1320, now + 0.06);

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(1320, now);
          osc2.frequency.setValueAtTime(1760, now + 0.06);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.26);
          osc2.stop(now + 0.26);
          break;
        }

        case "kernel_error": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);

          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }

        // ---------------------------------------------------------------
        // 7. OPERAÇÕES CAD ESPECÍFICAS (Extremamente curtas)
        // ---------------------------------------------------------------
        case "cad_create": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.setValueAtTime(840, now + 0.03);

          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case "cad_move": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(280, now);
          osc.frequency.linearRampToValueAtTime(360, now + 0.06);

          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }

        case "cad_rotate": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(580, now + 0.07);

          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case "cad_apply": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(440, now);
          osc1.frequency.setValueAtTime(659.25, now + 0.04);

          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(220, now);
          osc2.frequency.setValueAtTime(329.6, now + 0.04);

          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.17);
          osc2.stop(now + 0.17);
          break;
        }

        case "cad_undo": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.setValueAtTime(360, now + 0.04);

          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case "cad_redo": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(360, now);
          osc.frequency.setValueAtTime(520, now + 0.04);

          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case "cad_gizmo": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(1400, now + 0.04);

          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case "cad_reset": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(523.25, now);
          osc1.frequency.setValueAtTime(659.25, now + 0.05);

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(783.99, now);
          osc2.frequency.setValueAtTime(523.25, now + 0.05);

          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.15);
          osc2.stop(now + 0.15);
          break;
        }

        case "cad_measure": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1200, now);
          osc.frequency.setValueAtTime(1800, now + 0.02);

          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.07);
          break;
        }

        // ---------------------------------------------------------------
        // 8. SELEÇÃO B-REP
        // Face: curto e agudo | Aresta: ressonância média | Vértice: ultra-curto
        // ---------------------------------------------------------------
        case "cad_select_face": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(940, now + 0.06);

          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.075);
          break;
        }

        case "cad_select_edge": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(540, now + 0.06);

          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.07);
          break;
        }

        case "cad_select_vertex": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1480, now);

          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.045);
          break;
        }

        // ---------------------------------------------------------------
        // 9. PLANIFICAÇÃO — Sequência Sonora 3D -> Processamento -> Concluído
        // ---------------------------------------------------------------
        case "planify_sequence": {
          // Fase 1: Desdobramento 3D (0ms)
          const unfold = ctx.createOscillator();
          const unfoldGain = ctx.createGain();
          unfold.type = "triangle";
          unfold.frequency.setValueAtTime(260, now);
          unfold.frequency.exponentialRampToValueAtTime(680, now + 0.2);

          unfoldGain.gain.setValueAtTime(0.22, now);
          unfoldGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
          unfold.connect(unfoldGain);
          unfoldGain.connect(targetBus);
          unfold.start(now);
          unfold.stop(now + 0.23);

          // Fase 2: Chime de planificação vetorial concluída (240ms)
          const chime1 = ctx.createOscillator();
          const chime2 = ctx.createOscillator();
          const chimeGain = ctx.createGain();

          chime1.type = "sine";
          chime1.frequency.setValueAtTime(783.99, now + 0.22); // G5
          chime1.frequency.setValueAtTime(1046.5, now + 0.32); // C6

          chime2.type = "sine";
          chime2.frequency.setValueAtTime(1046.5, now + 0.22); // C6
          chime2.frequency.setValueAtTime(1567.98, now + 0.32); // G6

          chimeGain.gain.setValueAtTime(0.001, now + 0.22);
          chimeGain.gain.linearRampToValueAtTime(0.32, now + 0.27);
          chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);

          chime1.connect(chimeGain);
          chime2.connect(chimeGain);
          chimeGain.connect(targetBus);

          chime1.start(now + 0.22);
          chime2.start(now + 0.22);
          chime1.stop(now + 0.6);
          chime2.stop(now + 0.6);
          break;
        }

        // ---------------------------------------------------------------
        // 10. EXPORTAÇÃO (DXF, STEP, STL, PDF, SVG, PNG)
        // ---------------------------------------------------------------
        case "export_start": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case "export_success": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(523.25, now);
          osc1.frequency.setValueAtTime(659.25, now + 0.05);
          osc1.frequency.setValueAtTime(783.99, now + 0.1);

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(783.99, now);
          osc2.frequency.setValueAtTime(1046.5, now + 0.08);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.24);
          osc2.stop(now + 0.24);
          break;
        }

        case "export_error": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(280, now);
          osc.frequency.setValueAtTime(180, now + 0.06);

          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.13);
          break;
        }

        // ---------------------------------------------------------------
        // 11. NOTIFICAÇÕES (SUCCESS, WARNING, ERROR)
        // ---------------------------------------------------------------
        case "notify_success": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(659.25, now); // E5
          osc1.frequency.setValueAtTime(880, now + 0.05); // A5

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(1318.5, now + 0.05); // E6

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.32, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(targetBus);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.23);
          osc2.stop(now + 0.23);
          break;
        }

        case "notify_warning": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.setValueAtTime(320, now + 0.06);

          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        }

        case "notify_error": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(360, now);
          osc.frequency.setValueAtTime(240, now + 0.06);

          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

          osc.connect(gain);
          gain.connect(targetBus);
          osc.start(now);
          osc.stop(now + 0.17);
          break;
        }

        default:
          break;
      }
    } catch (e) {
      // Falha silenciosa para não travar a aplicação
      console.debug("[AudioManager.play] Erro no efeito:", e);
    }
  }

  // =========================================================================
  // TRILHA SONORA INSTRUMENTAL ORIGINAL CALDRA — "THE GEOMETRY OF DISCOVERY"
  // Suíte Narrativa em 7 Movimentos (4:10 / 250s):
  // 1. INTRO [0:00 - 0:30] — CURIOSIDADE (Felt piano solo, amplo espaço)
  // 2. EXPLORAÇÃO [0:30 - 1:10] — SISTEMAS (Violoncelo, eletrônica sutil, handpan)
  // 3. DESCOBERTA [1:10 - 1:50] — LUZ & GEOMETRIA (Lídia aberta, harpa, celesta)
  // 4. INCERTEZA [1:50 - 2:30] — O LABIRINTO SUSPENSO (Tensão modal, madeira)
  // 5. COMPREENSÃO [2:30 - 3:10] — A FORMA REVELADA (Harmonia plena integrada)
  // 6. MARAVILHA SERENA [3:10 - 3:45] — O CLÍMAX NOBRE (Ápice sem bombast)
  // 7. SERENIDADE [3:45 - 4:10] — RETORNO & PAZ (Desvanecimento e silêncio pleno)
  // =========================================================================

  public playMusic(trackId = "caldra_suite"): void {
    void trackId;
    if (this.isMusicPlaying) return;
    if (!this.settings.musicEnabled || this.settings.isMuted) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    this.isMusicPlaying = true;
    this.startSuite(0);
  }

  public stopMusic(): void {
    this.isMusicPlaying = false;

    if (this.suiteUpdateTimer !== null) {
      window.clearInterval(this.suiteUpdateTimer);
      this.suiteUpdateTimer = null;
    }
    if (this.suiteLoopTimer !== null) {
      window.clearTimeout(this.suiteLoopTimer);
      this.suiteLoopTimer = null;
    }

    // Suaviza e cessa vozes ativas
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices.forEach((v) => {
        try {
          v.gain.gain.setTargetAtTime(0.0001, now, 0.35);
          window.setTimeout(() => {
            v.oscs.forEach((o) => {
              try {
                if ("stop" in o && typeof o.stop === "function") {
                  o.stop();
                }
              } catch (e) {
                void e;
              }
            });
          }, 600);
        } catch (e) {
          void e;
        }
      });
      this.activeVoices = [];
    }

    this.notify();
  }

  /** Pula diretamente para um movimento da suíte (0 a 6) */
  public seekMovement(index: number): void {
    if (index < 0 || index >= CALDRA_MOVEMENTS.length) return;
    const movement = CALDRA_MOVEMENTS[index];

    if (!this.settings.musicEnabled || this.settings.isMuted) {
      this.settings.musicEnabled = true;
      this.settings.isMuted = false;
      this.saveSettings();
    }

    this.stopMusic();
    this.isMusicPlaying = true;
    this.startSuite(movement.startTime);
  }

  public getMovements(): MovementDescriptor[] {
    return CALDRA_MOVEMENTS;
  }

  private startSuite(fromSecond = 0): void {
    if (!this.ctx || !this.isMusicPlaying) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.suiteStartTime = now - fromSecond;

    // Agenda os eventos da partitura a partir de fromSecond
    CALDRA_SCORE.forEach((event) => {
      if (event.t >= fromSecond && event.t < TOTAL_SUITE_DURATION) {
        const scheduleTime = this.suiteStartTime + event.t;
        this.dispatchScoreEvent(event, scheduleTime);
      }
    });

    // Agenda o próximo ciclo completo sem costuras
    const remainingTime = TOTAL_SUITE_DURATION - fromSecond;
    this.suiteLoopTimer = window.setTimeout(() => {
      if (!this.isMusicPlaying) return;
      this.startSuite(0);
    }, Math.max(100, remainingTime * 1000));

    // Timer de atualização do progresso e movimento para a interface do usuário
    if (this.suiteUpdateTimer) {
      window.clearInterval(this.suiteUpdateTimer);
    }
    this.suiteUpdateTimer = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.ctx) return;
      const elapsed = (this.ctx.currentTime - this.suiteStartTime) % TOTAL_SUITE_DURATION;
      const curM =
        CALDRA_MOVEMENTS.find((m) => elapsed >= m.startTime && elapsed < m.endTime) ||
        CALDRA_MOVEMENTS[0];

      if (
        this.settings.currentMovementIndex !== curM.index ||
        this.settings.musicTimeSeconds !== Math.floor(elapsed)
      ) {
        this.settings.currentMovementIndex = curM.index;
        this.settings.currentMovementName = curM.name;
        this.settings.musicTimeSeconds = Math.floor(elapsed);
        this.notify();
      }
    }, 500);
  }

  private dispatchScoreEvent(event: ScoreEvent, scheduleTime: number): void {
    const pan = event.pan ?? 0;
    switch (event.instrument) {
      case "felt_piano":
        this.triggerFeltPiano(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "cello":
        this.triggerCello(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "double_bass":
      case "sub_bass":
        this.triggerDoubleBass(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "strings":
        this.triggerStrings(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "harp":
        this.triggerHarp(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "celesta":
        this.triggerCelesta(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "kalimba":
      case "handpan":
        this.triggerHandpanNote(event.frequencies[0], scheduleTime, pan, event.velocity, event.duration);
        break;
      case "woodwind":
        this.triggerWoodwind(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "analog_pad":
        this.triggerAnalogPad(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
      case "synth_texture":
        this.triggerAnalogPad(event.frequencies, scheduleTime, event.velocity * 0.7, event.duration, pan);
        break;
      case "ancient_choir":
        this.triggerAncientChoir(event.frequencies, scheduleTime, event.velocity, event.duration, pan);
        break;
    }
  }

  // =========================================================================
  // MODELOS DE SÍNTESE ACÚSTICA PROCEDURAL DOS INSTRUMENTOS
  // =========================================================================

  /**
   * 1. PIANO DE FELTRO ÍNTIMO (NARRADOR PRINCIPAL COM RIQUEZA HARMÔNICA)
   * Ataque aveludado, voicings abertos, acordes polifônicos, inarmonicidade de cordas e soundboard
   */
  public triggerFeltPiano(
    frequencies: number[],
    startTime: number,
    velocity = 0.055,
    duration = 4.0,
    pan = 0,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const soundboardFilter = ctx.createBiquadFilter();

      soundboardFilter.type = "lowpass";
      const baseCutoff = Math.min(2800, 1100 + velocity * 18000);
      soundboardFilter.frequency.setValueAtTime(baseCutoff, startTime);
      soundboardFilter.frequency.exponentialRampToValueAtTime(680, startTime + duration);
      soundboardFilter.Q.setValueAtTime(1.2, startTime);

      // Escalonamento harmônico para acordes de múltiplas notas (preserva o calor aveludado sem clipping)
      const count = Math.max(1, frequencies.length);
      const polyScalar = 1 / Math.pow(count, 0.40);
      const humanVel = Math.max(
        0.02,
        Math.min(0.08, velocity * polyScalar * (1 + (Math.random() - 0.5) * 0.06)),
      );

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(humanVel, startTime + 0.022);
      noteGain.gain.exponentialRampToValueAtTime(humanVel * 0.48, startTime + 0.95);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      // Micro-deslocamento humano para notas dentro de um acorde (efeito de dedilhado natural de 12ms a 22ms)
      frequencies.forEach((freq, idx) => {
        const noteOffset = idx > 0 ? (idx * 0.012 * (1 + (Math.random() - 0.5) * 0.2)) : 0;
        const noteStart = startTime + noteOffset;

        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, noteStart);
        osc1.connect(soundboardFilter);
        oscs.push(osc1);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 2.0015, noteStart);
        g2.gain.setValueAtTime(0.46, noteStart);
        osc2.connect(g2);
        g2.connect(soundboardFilter);
        oscs.push(osc2);

        const osc3 = ctx.createOscillator();
        const g3 = ctx.createGain();
        osc3.type = "triangle";
        osc3.frequency.setValueAtTime(freq * 3.003, noteStart);
        g3.gain.setValueAtTime(0.18, noteStart);
        osc3.connect(g3);
        g3.connect(soundboardFilter);
        oscs.push(osc3);
      });

      // Transiente tátil de impacto de feltro
      try {
        const bufSize = Math.floor(ctx.sampleRate * 0.022);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = "bandpass";
        nFilter.frequency.setValueAtTime(480, startTime);
        nFilter.Q.setValueAtTime(2.0, startTime);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.014, startTime);
        nGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.022);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(noteGain);
        noise.start(startTime);
        noise.stop(startTime + 0.025);
      } catch {
        // Fallback
      }

      soundboardFilter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 2. VIOLONCELO EXPRESSIVO PROFUNDO
   * Arco acústico lento, formantes de caixa de madeira (220Hz, 540Hz) e vibrato orgânico
   */
  public triggerCello(
    frequencies: number[],
    startTime: number,
    velocity = 0.05,
    duration = 6.0,
    pan = -0.2,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();

      const formant1 = ctx.createBiquadFilter();
      formant1.type = "peaking";
      formant1.frequency.setValueAtTime(220, startTime);
      formant1.Q.setValueAtTime(3.2, startTime);
      formant1.gain.setValueAtTime(6.0, startTime);

      const formant2 = ctx.createBiquadFilter();
      formant2.type = "peaking";
      formant2.frequency.setValueAtTime(540, startTime);
      formant2.Q.setValueAtTime(2.5, startTime);
      formant2.gain.setValueAtTime(4.5, startTime);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(2200, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.35);
      noteGain.gain.setValueAtTime(velocity, startTime + duration - 0.8);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const oscSaw = ctx.createOscillator();
        const oscTri = ctx.createOscillator();
        const gTri = ctx.createGain();

        oscSaw.type = "sawtooth";
        oscSaw.frequency.setValueAtTime(freq, startTime);

        oscTri.type = "triangle";
        oscTri.frequency.setValueAtTime(freq * 1.002, startTime);
        gTri.gain.setValueAtTime(0.5, startTime);

        // LFO de vibrato humano
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.frequency.setValueAtTime(4.7, startTime);
        vibratoGain.gain.setValueAtTime(0.0, startTime);
        vibratoGain.gain.linearRampToValueAtTime(freq * 0.004, startTime + 0.6);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(oscSaw.frequency);
        vibratoGain.connect(oscTri.frequency);
        vibrato.start(startTime);
        vibrato.stop(startTime + duration + 0.1);
        oscs.push(vibrato);

        oscSaw.connect(formant1);
        oscTri.connect(gTri);
        gTri.connect(formant1);

        oscs.push(oscSaw, oscTri);
      });

      formant1.connect(formant2);
      formant2.connect(lowpass);
      lowpass.connect(noteGain);

      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        try {
          o.start(startTime);
          o.stop(startTime + duration + 0.1);
        } catch {
          // ignore
        }
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 3. CONTRABAIXO ACÚSTICO SUAVE
   * Fundamentação grave de madeira quente
   */
  public triggerDoubleBass(
    frequencies: number[],
    startTime: number,
    velocity = 0.045,
    duration = 7.0,
    pan = 0,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(240, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.08);
      noteGain.gain.exponentialRampToValueAtTime(velocity * 0.5, startTime + 2.0);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(filter);
        oscs.push(osc);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(freq * 2, startTime);
        g2.gain.setValueAtTime(0.35, startTime);
        osc2.connect(g2);
        g2.connect(filter);
        oscs.push(osc2);
      });

      filter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 4. VIOLA E CORDAS SUSTENTADAS
   * Ambiência estereofônica ampla com chorus analógico e filtro sedoso
   */
  public triggerStrings(
    frequencies: number[],
    startTime: number,
    velocity = 0.035,
    duration = 10.0,
    pan = 0,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, startTime);
      filter.Q.setValueAtTime(1.0, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 1.8);
      noteGain.gain.setValueAtTime(velocity, startTime + duration - 2.2);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq, idx) => {
        [-4, 0, 4].forEach((detune) => {
          const osc = ctx.createOscillator();
          osc.type = idx % 2 === 0 ? "sawtooth" : "triangle";
          osc.frequency.setValueAtTime(freq, startTime);
          osc.detune.setValueAtTime(detune, startTime);
          osc.connect(filter);
          oscs.push(osc);
        });
      });

      filter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 5. HARPA DEDILHADA DELICADA
   * Beliscão de náilon/tripa acústico, arpejos luminosos
   */
  public triggerHarp(
    frequencies: number[],
    startTime: number,
    velocity = 0.04,
    duration = 3.5,
    pan = 0.25,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2800, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.006);
      noteGain.gain.exponentialRampToValueAtTime(velocity * 0.35, startTime + 0.5);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, startTime);
        osc1.connect(filter);
        oscs.push(osc1);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(freq * 2.001, startTime);
        g2.gain.setValueAtTime(0.3, startTime);
        osc2.connect(g2);
        g2.connect(filter);
        oscs.push(osc2);
      });

      // Transiente sutil de beliscão
      try {
        const bufSize = Math.floor(ctx.sampleRate * 0.015);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.25));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = "bandpass";
        nFilter.frequency.setValueAtTime(1600, startTime);
        nFilter.Q.setValueAtTime(3.0, startTime);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.01, startTime);
        nGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.015);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(noteGain);
        noise.start(startTime);
        noise.stop(startTime + 0.02);
      } catch {
        // Fallback
      }

      filter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 6. CELESTA CRISTALINA PONTUAL
   * Brilho de sino prismático com ressonância pura
   */
  public triggerCelesta(
    frequencies: number[],
    startTime: number,
    velocity = 0.035,
    duration = 2.8,
    pan = 0.3,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.004);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, startTime);
        osc1.connect(noteGain);
        oscs.push(osc1);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq * 4.0, startTime);
        g2.gain.setValueAtTime(0.22, startTime);
        osc2.connect(g2);
        g2.connect(noteGain);
        oscs.push(osc2);

        const osc3 = ctx.createOscillator();
        const g3 = ctx.createGain();
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(freq * 8.12, startTime);
        g3.gain.setValueAtTime(0.08, startTime);
        osc3.connect(g3);
        g3.connect(noteGain);
        oscs.push(osc3);
      });

      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 7. SOPRO DE MADEIRA SUAVE / FLAUTA GRAVE
   * Ar, chiff e calor de coluna de ressonância
   */
  public triggerWoodwind(
    frequencies: number[],
    startTime: number,
    velocity = 0.035,
    duration = 4.0,
    pan = -0.15,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1600, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 0.25);
      noteGain.gain.setValueAtTime(velocity, startTime + duration - 0.6);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);

        const vib = ctx.createOscillator();
        const vGain = ctx.createGain();
        vib.frequency.setValueAtTime(5.0, startTime);
        vGain.gain.setValueAtTime(freq * 0.003, startTime);
        vib.connect(vGain);
        vGain.connect(osc.frequency);
        vib.start(startTime);
        vib.stop(startTime + duration + 0.1);
        oscs.push(vib);

        osc.connect(filter);
        oscs.push(osc);
      });

      // Ar sutil
      try {
        const bufSize = Math.floor(ctx.sampleRate * 0.04);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.4));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const bFilter = ctx.createBiquadFilter();
        bFilter.type = "bandpass";
        bFilter.frequency.setValueAtTime(950, startTime);
        bFilter.Q.setValueAtTime(2.0, startTime);
        const bGain = ctx.createGain();
        bGain.gain.setValueAtTime(0.008, startTime);
        bGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);
        noise.connect(bFilter);
        bFilter.connect(bGain);
        bGain.connect(noteGain);
        noise.start(startTime);
        noise.stop(startTime + 0.05);
      } catch {
        // Fallback
      }

      filter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        try {
          o.start(startTime);
          o.stop(startTime + duration + 0.1);
        } catch {
          // ignore
        }
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 8. PAD ANALÓGICO QUENTE & TEXTURAS DIGITAIS SUTIS
   * Camada eletrônica sofisticada com respiração de filtro (zero drone permanente)
   */
  public triggerAnalogPad(
    frequencies: number[],
    startTime: number,
    velocity = 0.028,
    duration = 11.0,
    pan = 0,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, startTime);
      filter.frequency.linearRampToValueAtTime(1400, startTime + duration * 0.45);
      filter.frequency.exponentialRampToValueAtTime(550, startTime + duration);
      filter.Q.setValueAtTime(1.8, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 2.0);
      noteGain.gain.setValueAtTime(velocity, startTime + duration - 2.5);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq, idx) => {
        const osc1 = ctx.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, startTime);
        osc1.detune.setValueAtTime(idx % 2 === 0 ? -3 : 3, startTime);
        osc1.connect(filter);
        oscs.push(osc1);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(freq * 1.001, startTime);
        g2.gain.setValueAtTime(0.2, startTime);
        osc2.connect(g2);
        g2.connect(filter);
        oscs.push(osc2);
      });

      filter.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /**
   * 9. CAMADA DE CORAL/VOGAIS ANTIGAS ATEMPORAIS
   * Formantes vocais acústicos sagrados (Ah/Oh em 740Hz e 1160Hz) sem letras
   */
  public triggerAncientChoir(
    frequencies: number[],
    startTime: number,
    velocity = 0.025,
    duration = 12.0,
    pan = 0,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];
      const noteGain = ctx.createGain();

      const f1 = ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.setValueAtTime(740, startTime);
      f1.Q.setValueAtTime(3.2, startTime);

      const f2 = ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.setValueAtTime(1160, startTime);
      f2.Q.setValueAtTime(3.5, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + 2.4);
      noteGain.gain.setValueAtTime(velocity, startTime + duration - 2.8);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, startTime);
        osc.detune.setValueAtTime((Math.random() - 0.5) * 4, startTime);

        osc.connect(f1);
        osc.connect(f2);
        oscs.push(osc);
      });

      f1.connect(noteGain);
      f2.connect(noteGain);
      this.routeToSpatialMix(noteGain, pan, startTime, duration);

      oscs.forEach((o) => {
        o.start(startTime);
        o.stop(startTime + duration + 0.1);
      });

      this.registerVoice(oscs, noteGain, duration);
    } catch (e) {
      void e;
    }
  }

  /** Roteamento espacial de mixagem para o barramento estéreo e reverb de catedral */
  private routeToSpatialMix(node: GainNode, pan: number, startTime: number, duration: number): void {
    void duration;
    if (!this.ctx || !this.musicGain) return;
    if (typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, pan)), startTime);
      node.connect(panner);
      panner.connect(this.musicGain);

      if (this.handpanReverbNode) {
        panner.connect(this.handpanReverbNode);
      } else if (this.musicDelayNode) {
        panner.connect(this.musicDelayNode);
      }
    } else {
      node.connect(this.musicGain);
      if (this.handpanReverbNode) {
        node.connect(this.handpanReverbNode);
      } else if (this.musicDelayNode) {
        node.connect(this.musicDelayNode);
      }
    }
  }

  /** Registro e descarte seguro de vozes ativas para cancelamento e transições limpas */
  private registerVoice(
    oscs: (OscillatorNode | AudioBufferSourceNode)[],
    gain: GainNode,
    duration: number,
  ): void {
    const voice = { oscs, gain };
    this.activeVoices.push(voice);
    window.setTimeout(() => {
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) {
        this.activeVoices.splice(idx, 1);
      }
    }, (duration + 0.5) * 1000);
  }

  /**
   * HANDPAN ACÚSTICO — NOVA CAMADA MUSICAL
   * Timbre: quente, profundo, ressonante, natural, etéreo e celestial.
   * Acústica física e modelagem procedural:
   * - Fundamental (f0): senóide orgânica pura com ataque suave de polegar e longo sustain.
   * - Harmônico Oitava (2 * f0): eixo longitudinal da cúpula do handpan, brilho aveludado.
   * - Harmônico Quinta Composta (2.996 * f0): eixo transversal, canto harmônico etéreo.
   * - Cavidade Gu / Helmholtz: ressonância corporal quente em notas graves/médias.
   * - Transiente de toque: ruído orgânico micro-filtrado sem aspereza metálica.
   * - Reverb espacial dedicado: cauda de difusão natural de 3.2 a 4.5 segundos.
   * - Hierarquia de mixagem: nível sutil logo atrás do piano (preenche sem competir).
   */
  public triggerHandpanNote(
    frequency: number,
    startTime: number,
    pan = 0,
    velocity = 0.045,
    sustainDuration = 3.8,
    outputBus?: GainNode,
  ): void {
    if (!this.ctx) return;
    const targetBus = outputBus || this.musicGain;
    if (!targetBus) return;
    // Se não for teste direto via outputBus, respeita o estado da música
    if (!outputBus && !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const oscs: OscillatorNode[] = [];

      // Barramento de ganho e filtro tonal da nota do handpan
      const noteGain = ctx.createGain();
      const toneFilter = ctx.createBiquadFilter();

      // Filtro de calor acústico: remove arestas e confere caráter metálico sedoso
      toneFilter.type = "lowpass";
      toneFilter.frequency.setValueAtTime(2600, startTime);
      toneFilter.frequency.exponentialRampToValueAtTime(1400, startTime + sustainDuration);
      toneFilter.Q.setValueAtTime(1.1, startTime);

      // Execução humana com pequenas variações orgânicas de intensidade e ataque
      const humanVelocity = Math.max(0.02, Math.min(0.08, velocity * (1 + (Math.random() - 0.5) * 0.1)));
      const attackTime = 0.024 + (Math.random() - 0.5) * 0.006; // Ataque humano (18ms - 30ms)

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(humanVelocity, startTime + attackTime);
      // Decaimento natural em duas etapas: corpo presente e longa ressonância que se prolonga
      noteGain.gain.exponentialRampToValueAtTime(humanVelocity * 0.42, startTime + 1.3);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration);

      // 1. FUNDAMENTAL (f0) — Corpo quente e sustentação principal
      const oscFund = ctx.createOscillator();
      const gainFund = ctx.createGain();
      oscFund.type = "sine";
      oscFund.frequency.setValueAtTime(frequency, startTime);
      // Micro-detune orgânico sutil (ar em vibração)
      oscFund.detune.setValueAtTime((Math.random() - 0.5) * 2.2, startTime);
      gainFund.gain.setValueAtTime(1.0, startTime);

      oscFund.connect(gainFund);
      gainFund.connect(toneFilter);
      oscs.push(oscFund);

      // 2. HARMÔNICO OITAVA (2 * f0) — Eixo longitudinal da cúpula
      const oscOct = ctx.createOscillator();
      const gainOct = ctx.createGain();
      oscOct.type = "sine";
      oscOct.frequency.setValueAtTime(frequency * 2.001, startTime);
      gainOct.gain.setValueAtTime(0.36, startTime);
      gainOct.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration * 0.72);

      oscOct.connect(gainOct);
      gainOct.connect(toneFilter);
      oscs.push(oscOct);

      // 3. QUINTA COMPOSTA (2.996 * f0) — Eixo transversal (o "canto" do handpan)
      const oscFifth = ctx.createOscillator();
      const gainFifth = ctx.createGain();
      oscFifth.type = "sine";
      oscFifth.frequency.setValueAtTime(frequency * 2.996, startTime);
      gainFifth.gain.setValueAtTime(0.19, startTime);
      gainFifth.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration * 0.58);

      oscFifth.connect(gainFifth);
      gainFifth.connect(toneFilter);
      oscs.push(oscFifth);

      // 4. RESSONÂNCIA CAVITÁRIA CORPO GU (HELMHOLTZ) — Profundidade acústica
      if (frequency < 420) {
        const bodyOsc = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        bodyOsc.type = "sine";
        bodyOsc.frequency.setValueAtTime(Math.min(frequency * 0.5, 115), startTime);
        bodyGain.gain.setValueAtTime(0.22, startTime);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);

        bodyOsc.connect(bodyGain);
        bodyGain.connect(toneFilter);
        oscs.push(bodyOsc);

        bodyOsc.start(startTime);
        bodyOsc.stop(startTime + 0.42);
      }

      // 5. TRANSIENTE DE CONTATO (Toque aveludado do polegar, sem clique digital)
      try {
        const bufferSize = Math.floor(ctx.sampleRate * 0.025);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
        }
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const touchFilter = ctx.createBiquadFilter();
        touchFilter.type = "bandpass";
        touchFilter.frequency.setValueAtTime(540, startTime);
        touchFilter.Q.setValueAtTime(2.6, startTime);

        const touchGain = ctx.createGain();
        touchGain.gain.setValueAtTime(0.012, startTime);
        touchGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.025);

        noiseNode.connect(touchFilter);
        touchFilter.connect(touchGain);
        touchGain.connect(noteGain);

        noiseNode.start(startTime);
        noiseNode.stop(startTime + 0.028);
      } catch {
        // Fallback gracioso
      }

      toneFilter.connect(noteGain);

      // Panorâmica estéreo & Envio ao Reverb Natural e Espaçoso do Handpan
      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, pan)), startTime);
        noteGain.connect(panner);
        panner.connect(targetBus);

        if (this.handpanReverbNode) {
          panner.connect(this.handpanReverbNode);
        } else if (this.musicDelayNode) {
          panner.connect(this.musicDelayNode);
        }
      } else {
        noteGain.connect(targetBus);
        if (this.handpanReverbNode) {
          noteGain.connect(this.handpanReverbNode);
        } else if (this.musicDelayNode) {
          noteGain.connect(this.musicDelayNode);
        }
      }

      // Disparo coordenado dos osciladores
      oscs.forEach((osc) => {
        osc.start(startTime);
        osc.stop(startTime + sustainDuration + 0.15);
      });

      this.registerVoice(oscs, noteGain, sustainDuration);
    } catch (e) {
      void e;
    }
  }
}

export const audioManager = AudioManager.getInstance();
