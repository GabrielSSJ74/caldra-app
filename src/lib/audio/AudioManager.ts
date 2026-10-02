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

export type AudioCategory = "ui" | "cad" | "music" | "selection";

export type SoundEffectId =
  // Botões & Interface Geral
  | "ui_click"
  | "ui_select"
  | "ui_action"
  | "ui_nav"
  | "ui_toggle_open"
  | "ui_toggle_close"
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
}

const STORAGE_KEY = "caldra.audio_settings";

const DEFAULT_AUDIO_SETTINGS: AudioSettingsState = {
  masterVolume: 0.8,
  musicVolume: 0.2, // 20%
  effectsVolume: 0.25, // 25%
  uiVolume: 0.3, // 30%
  isMuted: false,
  uiSoundsEnabled: true,
  cadEffectsEnabled: true,
  musicEnabled: true,
  selectionSoundsEnabled: true,
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

  // Motor da Nova Trilha Sonora — "CALDRA HORIZON" (Mistério, Curiosidade & Exploração)
  private isMusicPlaying = false;
  private ambientTimer: number | null = null;
  private pulseTimer: number | null = null;
  private pulseStep = 0;
  private currentChordIndex = 0;
  private activeVoices: { oscs: (OscillatorNode | AudioBufferSourceNode)[]; gain: GainNode }[] = [];
  private musicDelayNode: DelayNode | null = null;
  private musicFeedbackGain: GainNode | null = null;
  private musicReverbNode: ConvolverNode | null = null;
  private musicReverbGain: GainNode | null = null;

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
  public static playMusic(trackId = "caldra_main"): void {
    AudioManager.getInstance().playMusic(trackId);
  }

  /** Atalho estático para parar a trilha ambiente */
  public static stopMusic(): void {
    AudioManager.getInstance().stopMusic();
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

        // Barramento de delay estéreo espacial para a música de exploração
        try {
          this.musicDelayNode = this.ctx.createDelay();
          this.musicDelayNode.delayTime.setValueAtTime(0.32, this.ctx.currentTime);
          this.musicFeedbackGain = this.ctx.createGain();
          this.musicFeedbackGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

          const delayFilter = this.ctx.createBiquadFilter();
          delayFilter.type = "lowpass";
          delayFilter.frequency.setValueAtTime(2600, this.ctx.currentTime);

          this.musicDelayNode.connect(delayFilter);
          delayFilter.connect(this.musicFeedbackGain);
          this.musicFeedbackGain.connect(this.musicDelayNode);
          delayFilter.connect(this.musicGain);
        } catch (delayErr) {
          void delayErr;
        }

        // Barramento de Reverb Espacial Algorítmico (cauda longa e aveludada ~3.8s)
        try {
          this.musicReverbNode = this.ctx.createConvolver();
          this.musicReverbNode.buffer = this.buildImpulseResponse(this.ctx, 3.8, 2.3);
          this.musicReverbGain = this.ctx.createGain();
          this.musicReverbGain.gain.setValueAtTime(0.40, this.ctx.currentTime);

          const reverbFilter = this.ctx.createBiquadFilter();
          reverbFilter.type = "lowpass";
          reverbFilter.frequency.setValueAtTime(3400, this.ctx.currentTime);

          this.musicReverbNode.connect(reverbFilter);
          reverbFilter.connect(this.musicReverbGain);
          this.musicReverbGain.connect(this.musicGain);
        } catch (revErr) {
          void revErr;
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

  /** Gera buffer de resposta ao impulso procedural para reverb acústico de cauda longa */
  private buildImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // Decaimento exponencial com difusão estéreo orgânica
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
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
  // TRILHA SONORA PRINCIPAL — "CALDRA: EXPLORAÇÃO, MISTÉRIO & CONTEMPLAÇÃO"
  // Dois Mundos Integrados:
  // Mundo 1: Tecnologia, CAD, Síntese Digital Discreta, Espaço Estéreo Amplo
  // Mundo 2: Exploração Orgânica, Criatividade, Timbres Acústicos de Felt Piano,
  //          Contemplação de Construção (estilo exploração/sandbox sereno)
  // Zero Melancolia | Zero Tristeza | Harmonia Aberta, Curiosa e Esperançosa
  // =========================================================================

  public playMusic(trackId = "caldra_main"): void {
    void trackId;
    if (this.isMusicPlaying) return;
    if (!this.settings.musicEnabled || this.settings.isMuted) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    this.isMusicPlaying = true;
    this.startAmbientEngine();
  }

  public stopMusic(): void {
    this.isMusicPlaying = false;
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.pulseTimer !== null) {
      window.clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }

    // Suaviza e cessa vozes ativas
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices.forEach((v) => {
        try {
          v.gain.gain.setTargetAtTime(0.0001, now, 0.4);
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
          }, 800);
        } catch (e) {
          void e;
        }
      });
      this.activeVoices = [];
    }
  }

  private startAmbientEngine(): void {
    if (!this.ctx || !this.isMusicPlaying) return;

    // -----------------------------------------------------------------------
    // CALDRA ORIGINAL CINEMATIC AMBIENT SOUNDTRACK
    // "Steel, Geometry & Human Craftsmanship"
    //
    // Sonic Signature:
    // Hybrid Metallic-String Acoustic Instrument (Resonant wooden body, bright
    // metallic strings, low tuning, finger-picked touch, subtle fret/finger noise).
    //
    // Supporting Orchestration:
    // Felt piano, low cello & double bass, soft viola/cello sustains, sparse harp,
    // subtle low wooden flute, celesta, warm analog synth, granular ambient
    // textures, and restrained resonant metallic percussion.
    //
    // Emotional Arc (6 Progressive Movements with Seamless Infinite Loop):
    // 1. CURIOSITY    — Extremely sparse hybrid metallic string solo in quiet space
    // 2. EXPLORATION  — Felt piano joins, low double bass anchors, stereo opens
    // 3. DISCOVERY    — Low wooden flute breath melody, celesta points like light on steel
    // 4. CONCENTRATION— Chamber viola & cello sustains, felt piano, focused craftsmanship
    // 5. VASTNESS     — Restrained cinematic climax: synth swell, bowed basses, bronze chime
    // 6. SERENITY     — Dissolving gently back into space, suspended resolution & loop
    // -----------------------------------------------------------------------

    const cinematicMovements = [
      // =====================================================================
      // MOVEMENT 1: CURIOSITY (Extreme sparseness, vast quiet space)
      // "Entering an enormous engineered space made of steel and geometry."
      // Open harmony: Dadd9(no3) — Ancient, technological, expectant.
      // =====================================================================
      {
        movement: 1,
        title: "curiosity",
        bassFreq: 73.42, // D2 (subtle acoustic anchor)
        bassType: "double_bass" as const,
        synthPad: [],
        chamberStrings: [],
        hybridStrings: [
          { f: 73.42, delay: 1.6, pan: -0.12, vel: 0.88, fretNoise: 0.65 },  // Low D2 (deep steel wound string)
          { f: 110.00, delay: 4.8, pan: 0.18, vel: 0.82, fretNoise: 0.55 },  // A2
          { f: 146.83, delay: 7.9, pan: -0.05, vel: 0.90, fretNoise: 0.70 }, // D3
          { f: 220.00, delay: 11.2, pan: 0.15, vel: 0.85, fretNoise: 0.60 }, // A3 (open question)
        ],
        feltPiano: [],
        woodenFlute: [],
        celesta: [],
        harp: [],
        metallicChime: null,
        granularTexture: { f: 880.0, delay: 6.0, pan: 0.3 },
      },

      // =====================================================================
      // MOVEMENT 2: EXPLORATION (Felt piano enters, spatial width expands)
      // "Stepping forward, exploring the perimeter of the digital workshop."
      // Open harmony: Gmaj9/D (Low D2 bass, G2, B2, D3, F#3, A3)
      // =====================================================================
      {
        movement: 2,
        title: "exploration",
        bassFreq: 73.42, // D2 bass pedal
        bassType: "double_bass" as const,
        synthPad: [98.00, 146.83, 185.00, 220.00], // G2, D3, F#3, A3 (very quiet warm analog air)
        chamberStrings: [],
        hybridStrings: [
          { f: 98.00, delay: 2.0, pan: -0.22, vel: 0.85, fretNoise: 0.6 },  // G2
          { f: 185.00, delay: 5.6, pan: 0.25, vel: 0.88, fretNoise: 0.55 }, // F#3
          { f: 220.00, delay: 9.4, pan: -0.18, vel: 0.92, fretNoise: 0.6 }, // A3
        ],
        feltPiano: [
          { f: 293.66, delay: 3.4, pan: 0.18, vel: 0.82 }, // D4 (intimate felt strike)
          { f: 369.99, delay: 7.2, pan: -0.15, vel: 0.85 }, // F#4
          { f: 440.00, delay: 11.0, pan: 0.12, vel: 0.80 }, // A4
        ],
        woodenFlute: [],
        celesta: [],
        harp: [],
        metallicChime: null,
        granularTexture: { f: 1174.66, delay: 4.5, pan: -0.35 },
      },

      // =====================================================================
      // MOVEMENT 3: DISCOVERY (Low wooden flute melody & celesta spark)
      // "Discovering an unexpected geometric possibility; light hitting steel."
      // Open harmony: Bm11 (B1, F#2, D3, A3, E4)
      // =====================================================================
      {
        movement: 3,
        title: "discovery",
        bassFreq: 61.74, // B1
        bassType: "cello_bowed" as const,
        synthPad: [123.47, 185.00, 220.00, 329.63], // B2, F#3, A3, E4
        chamberStrings: [146.83, 220.00, 329.63],     // D3, A3, E4 (soft viola sustain)
        hybridStrings: [
          { f: 123.47, delay: 1.8, pan: -0.25, vel: 0.90, fretNoise: 0.65 }, // B2
          { f: 293.66, delay: 8.5, pan: 0.20, vel: 0.86, fretNoise: 0.55 },  // D4
        ],
        feltPiano: [
          { f: 220.00, delay: 6.8, pan: -0.18, vel: 0.84 }, // A3
          { f: 329.63, delay: 10.5, pan: 0.15, vel: 0.80 }, // E4
        ],
        woodenFlute: [
          { f: 293.66, delay: 3.0, pan: -0.20, vel: 0.88 }, // D4 (breath tone melody)
          { f: 329.63, delay: 5.2, pan: -0.15, vel: 0.85 }, // E4
          { f: 369.99, delay: 7.5, pan: -0.22, vel: 0.92 }, // F#4
        ],
        celesta: [
          { f: 1174.66, delay: 4.4, pan: 0.38 }, // D6 (crystalline precision)
          { f: 1479.98, delay: 8.8, pan: -0.32 }, // F#6
        ],
        harp: [],
        metallicChime: null,
        granularTexture: null,
      },

      // =====================================================================
      // MOVEMENT 4: CONCENTRATION (Chamber strings, felt piano, focused craft)
      // "Deep engineering focus, meticulous calculations, craftsmanship in action."
      // Open harmony: Em9(add11) (E2, B2, G3, D4, F#4, A4)
      // =====================================================================
      {
        movement: 4,
        title: "concentration",
        bassFreq: 82.41, // E2
        bassType: "cello_bowed" as const,
        synthPad: [164.81, 196.00, 246.94, 293.66], // E3, G3, B3, D4
        chamberStrings: [196.00, 293.66, 369.99, 440.00], // G3, D4, F#4, A4 (cello/viola sustains)
        hybridStrings: [
          { f: 82.41, delay: 2.2, pan: 0.22, vel: 0.88, fretNoise: 0.58 },  // Low E2
          { f: 164.81, delay: 6.4, pan: -0.20, vel: 0.85, fretNoise: 0.62 }, // E3
          { f: 293.66, delay: 10.8, pan: 0.18, vel: 0.90, fretNoise: 0.55 }, // D4
        ],
        feltPiano: [
          { f: 369.99, delay: 3.8, pan: -0.12, vel: 0.86 }, // F#4
          { f: 440.00, delay: 7.8, pan: 0.14, vel: 0.88 },  // A4
          { f: 246.94, delay: 11.5, pan: -0.10, vel: 0.82 }, // B3
        ],
        woodenFlute: [],
        celesta: [],
        // Sparse harp: delicate cascaded texture
        harp: [164.81, 246.94, 369.99, 440.00], // E3, B3, F#4, A4
        metallicChime: null,
        granularTexture: { f: 739.99, delay: 5.5, pan: 0.3 },
      },

      // =====================================================================
      // MOVEMENT 5: VASTNESS (The Restrained Climax — Monumental Steel World)
      // "Awe and grandeur; the monumental 3D geometry fully revealed."
      // Open harmony: Amaj7sus2/C# -> Dmaj9#11 (C#2 -> D2, A2, E3, G#3, C#4, F#4)
      // =====================================================================
      {
        movement: 5,
        title: "vastness",
        bassFreq: 69.30, // C#2 evolving to D2
        bassType: "double_bass" as const,
        synthPad: [138.59, 220.00, 277.18, 329.63, 415.30], // C#3, A3, C#4, E4, G#4
        chamberStrings: [220.00, 277.18, 369.99, 440.00],    // A3, C#4, F#4, A4 (full warm sustain)
        hybridStrings: [
          { f: 146.83, delay: 1.8, pan: -0.22, vel: 0.95, fretNoise: 0.70 }, // D3
          { f: 220.00, delay: 4.8, pan: 0.25, vel: 0.92, fretNoise: 0.65 },  // A3
          { f: 369.99, delay: 8.2, pan: -0.15, vel: 0.96, fretNoise: 0.72 }, // F#4
          { f: 415.30, delay: 11.5, pan: 0.20, vel: 0.88, fretNoise: 0.58 }, // G#4 (#11 lídia)
        ],
        feltPiano: [
          { f: 554.37, delay: 3.2, pan: 0.15, vel: 0.92 }, // C#5
          { f: 739.99, delay: 6.8, pan: -0.18, vel: 0.90 }, // F#5
          { f: 440.00, delay: 10.4, pan: 0.12, vel: 0.86 }, // A4
        ],
        woodenFlute: [
          { f: 369.99, delay: 5.5, pan: -0.25, vel: 0.85 }, // F#4 (long noble breath)
        ],
        celesta: [
          { f: 1661.22, delay: 7.2, pan: 0.35 }, // G#6 (luminous shimmer)
        ],
        harp: [146.83, 220.00, 329.63, 415.30, 554.37], // D3, A3, E4, G#4, C#5
        // Single restrained tuned bronze/anvil chime strike with long spatial tail
        metallicChime: { f: 880.0, delay: 2.2, pan: 0.05 },
        granularTexture: { f: 1318.51, delay: 4.0, pan: -0.3 },
      },

      // =====================================================================
      // MOVEMENT 6: SERENITY (Dissolve back into silence & perfect loop)
      // "The project takes shape; quiet peace and contemplation under open skies."
      // Open harmony: Asus4(add9) -> Dadd9 (A1, E2, A2, B2, D3, F#3)
      // Loops seamlessly back to Movement 1 (Dadd9).
      // =====================================================================
      {
        movement: 6,
        title: "serenity",
        bassFreq: 55.00, // A1 resolving gently
        bassType: "double_bass" as const,
        synthPad: [110.00, 164.81, 220.00, 246.94], // A2, E3, A3, B3 (whispering analog air)
        chamberStrings: [], // Strings have faded away
        hybridStrings: [
          { f: 110.00, delay: 2.0, pan: 0.18, vel: 0.84, fretNoise: 0.55 },  // A2
          { f: 146.83, delay: 5.8, pan: -0.15, vel: 0.88, fretNoise: 0.60 }, // D3
          { f: 185.00, delay: 9.6, pan: 0.10, vel: 0.80, fretNoise: 0.50 },  // F#3 (serene conclusion)
        ],
        feltPiano: [
          { f: 293.66, delay: 3.5, pan: -0.12, vel: 0.80 }, // D4 (distant, intimate)
          { f: 220.00, delay: 7.8, pan: 0.15, vel: 0.78 },  // A3
        ],
        woodenFlute: [],
        celesta: [],
        harp: [],
        metallicChime: null,
        granularTexture: null,
      },
    ];

    const MOVEMENT_DURATION = 14.8; // Duração de cada movimento com cauda longa de decaimento
    const MOVEMENT_INTERVAL = 11.5; // Intervalo para o próximo movimento (~3.3s de crossfade natural)
    this.currentChordIndex = 0;

    const playNextMovement = () => {
      if (!this.isMusicPlaying || !this.ctx) return;

      const current = cinematicMovements[this.currentChordIndex];
      this.currentChordIndex = (this.currentChordIndex + 1) % cinematicMovements.length;

      this.triggerCinematicMovement(current, MOVEMENT_DURATION);
    };

    // Inicia imediatamente o Movimento 1 (Curiosity)
    playNextMovement();

    // Agenda os próximos movimentos em ciclo contínuo sem cortes
    this.ambientTimer = window.setInterval(playNextMovement, MOVEMENT_INTERVAL * 1000);

    // Pulso muito sutil e contemplativo em 74 BPM (~1.62s = 2 tempos)
    this.pulseStep = 0;
    const PULSE_INTERVAL_MS = Math.round((60 / 74) * 2 * 1000);
    this.pulseTimer = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.ctx) return;
      this.triggerTechPulse();
    }, PULSE_INTERVAL_MS);
  }

  private triggerCinematicMovement(
    m: {
      movement: number;
      title: string;
      bassFreq: number;
      bassType: "double_bass" | "cello_bowed";
      synthPad: number[];
      chamberStrings: number[];
      hybridStrings: { f: number; delay: number; pan: number; vel: number; fretNoise: number }[];
      feltPiano: { f: number; delay: number; pan: number; vel: number }[];
      woodenFlute: { f: number; delay: number; pan: number; vel: number }[];
      celesta: { f: number; delay: number; pan: number }[];
      harp: number[];
      metallicChime: { f: number; delay: number; pan: number } | null;
      granularTexture: { f: number; delay: number; pan: number } | null;
    },
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const oscs: (OscillatorNode | AudioBufferSourceNode)[] = [];

    // 1. BAIXO ACÚSTICO / CELLO / DOUBLE BASS (Profundidade orgânica e ancoragem)
    if (m.bassFreq > 0) {
      this.triggerBowedCelloBass(m.bassFreq, now, duration, m.bassType === "double_bass");
    }

    // 2. SYNTH PAD ANALÓGICO QUENTE (Ar respirante atrás dos instrumentos acústicos)
    if (m.synthPad.length > 0) {
      this.triggerAnalogWarmSynth(m.synthPad, now, duration, oscs);
    }

    // 3. CORDAS DE CÂMARA (VIOLA & CELLO SUSTAINS)
    if (m.chamberStrings.length > 0) {
      this.triggerChamberStringSustain(m.chamberStrings, now, duration, oscs);
    }

    // 4. INSTRUMENTO PRINCIPAL: HYBRID METALLIC-STRING ACOUSTIC (Assinatura Sonora CALDRA)
    m.hybridStrings.forEach((s) => {
      this.triggerHybridAcousticString(s.f, now + s.delay, s.pan, s.vel, s.fretNoise);
    });

    // 5. FELT PIANO (Íntimo, martelo suave de feltro sobre cordas)
    m.feltPiano.forEach((p) => {
      this.triggerFeltPianoNote(p.f, now + p.delay, p.pan, p.vel);
    });

    // 6. LOW WOODEN FLUTE (Flauta baixa de madeira com ar e respiração sutil)
    m.woodenFlute.forEach((wf) => {
      this.triggerWoodenFlute(wf.f, now + wf.delay, wf.pan, wf.vel);
    });

    // 7. CELESTA / GLOCKENSPIEL (Pontos de luz pura e descoberta)
    m.celesta.forEach((c) => {
      this.triggerCelestaNote(c.f, now + c.delay, c.pan);
    });

    // 8. SPARSE HARP (Dedilhado em cascata orgânica)
    if (m.harp.length > 0) {
      this.triggerSparseHarp(m.harp, now + 3.2, 0.22);
    }

    // 9. RESSONÂNCIA METÁLICA RESTRITA (Bronze / Bigorna Afinada com cauda longa)
    if (m.metallicChime) {
      this.triggerResonantMetallicPercussion(m.metallicChime.f, now + m.metallicChime.delay, m.metallicChime.pan);
    }

    // 10. TEXTURA GRANULAR & REFLEXOS DE AÇO
    if (m.granularTexture) {
      this.triggerGranularAmbientTexture(m.granularTexture.f, now + m.granularTexture.delay, m.granularTexture.pan);
    }

    // Limpeza de vozes contínuas
    if (oscs.length > 0) {
      window.setTimeout(() => {
        oscs.forEach((o) => {
          try {
            if ("stop" in o && typeof o.stop === "function") o.stop();
          } catch (e) {
            void e;
          }
        });
      }, (duration + 1.2) * 1000);
    }
  }

  // =========================================================================
  // INSTRUMENTOS CINEMATOGRÁFICOS DA CALDRA (SÍNTESE FÍSICO-ACÚSTICA NATIVA)
  // =========================================================================

  /**
   * 1. ASSINATURA SONORA DA CALDRA: HYBRID METALLIC-STRING ACOUSTIC INSTRUMENT
   * - Caixa de ressonância de madeira nobre (formantes duplos de corpo em 125 Hz e 420 Hz)
   * - Cordas metálicas de afinação baixa (wound steel strings) com brilho nobre
   * - Transiente de atrito tátil do dedo e ruído de traste (fret/finger noise)
   * - Afinação baixa, micro-imperfeições humanas e decaimento sustentado de 4.2s
   */
  private triggerHybridAcousticString(
    frequency: number,
    startTime: number,
    pan: number,
    velocity = 1.0,
    fretNoise = 0.6,
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const noteGain = ctx.createGain();

      // Oscilador 1: Fundamental da corda metálica (senóide quente e densa)
      const oscFundamental = ctx.createOscillator();
      oscFundamental.type = "sine";
      oscFundamental.frequency.setValueAtTime(frequency, startTime);

      // Oscilador 2: Segundo harmônico metálico (triângulo ligeiramente desarmônico, típico de corda de aço grossa)
      const oscMetallicOvertones = ctx.createOscillator();
      oscMetallicOvertones.type = "triangle";
      oscMetallicOvertones.frequency.setValueAtTime(frequency * 2.003, startTime);

      // Oscilador 3: Terceiro harmônico cantante (brilho do enrolamento de bronze/aço)
      const oscHarmonic3 = ctx.createOscillator();
      oscHarmonic3.type = "sine";
      oscHarmonic3.frequency.setValueAtTime(frequency * 3.008, startTime);

      // Filtro de Ressonância da Caixa de Madeira (Cavidade acústica e tampo harmônico)
      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = "bandpass";
      bodyFilter.frequency.setValueAtTime(Math.max(125, frequency * 1.05), startTime);
      bodyFilter.Q.setValueAtTime(2.8, startTime);

      // Filtro de Brilho da Corda Metálica (abre no ataque do dedilhado e assenta na madeira)
      const stringFilter = ctx.createBiquadFilter();
      stringFilter.type = "lowpass";
      stringFilter.frequency.setValueAtTime(3200 * velocity, startTime);
      stringFilter.frequency.exponentialRampToValueAtTime(
        Math.max(450, frequency * 2.2),
        startTime + 0.45,
      );
      stringFilter.frequency.exponentialRampToValueAtTime(
        Math.max(220, frequency * 1.1),
        startTime + 3.2,
      );
      stringFilter.Q.setValueAtTime(1.5, startTime);

      // Ganhos balanceados das parciais metálicas
      const metallicGain = ctx.createGain();
      metallicGain.gain.setValueAtTime(0.35, startTime);
      oscMetallicOvertones.connect(metallicGain);

      const harmonic3Gain = ctx.createGain();
      harmonic3Gain.gain.setValueAtTime(0.18, startTime);
      oscHarmonic3.connect(harmonic3Gain);

      // Conexão dos harmônicos através dos filtros de corpo de madeira
      oscFundamental.connect(stringFilter);
      metallicGain.connect(stringFilter);
      harmonic3Gain.connect(stringFilter);
      stringFilter.connect(bodyFilter);
      bodyFilter.connect(noteGain);
      stringFilter.connect(noteGain); // Linha direta para preservar definição metálica limpa

      // TRANSIENTE TÁTIL DE DEDILHADO E RUÍDO DE TRASTE (Fret / Finger Scrape)
      // Produz o som físico do dedo desferindo a corda de aço e raspando o traste de metal
      if (fretNoise > 0.1) {
        const scrapeOsc = ctx.createOscillator();
        const scrapeGain = ctx.createGain();
        const scrapeFilter = ctx.createBiquadFilter();

        scrapeOsc.type = "sawtooth";
        scrapeOsc.frequency.setValueAtTime(2800, startTime);
        scrapeOsc.frequency.exponentialRampToValueAtTime(1100, startTime + 0.022);

        scrapeFilter.type = "bandpass";
        scrapeFilter.frequency.setValueAtTime(2200, startTime);
        scrapeFilter.Q.setValueAtTime(4.0, startTime);

        scrapeGain.gain.setValueAtTime(0.0001, startTime);
        scrapeGain.gain.linearRampToValueAtTime(0.038 * fretNoise, startTime + 0.004);
        scrapeGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.026);

        scrapeOsc.connect(scrapeFilter);
        scrapeFilter.connect(scrapeGain);
        scrapeGain.connect(noteGain);

        scrapeOsc.start(startTime);
        scrapeOsc.stop(startTime + 0.035);
      }

      // Envelope dinâmico de corda dedilhada com cauda longa e relaxante (4.2 segundos)
      const peakGain = 0.096 * velocity;
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.48, startTime + 0.8);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 4.2);

      // Panorâmica estéreo imersiva e envios espaciais (Dolby Atmos / 3D Space)
      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        noteGain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.44, startTime);
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
        if (this.musicDelayNode) {
          const delSend = ctx.createGain();
          delSend.gain.setValueAtTime(0.22, startTime);
          panner.connect(delSend);
          delSend.connect(this.musicDelayNode);
        }
      } else {
        noteGain.connect(this.musicGain);
        if (this.musicReverbNode) noteGain.connect(this.musicReverbNode);
      }

      oscFundamental.start(startTime);
      oscMetallicOvertones.start(startTime);
      oscHarmonic3.start(startTime);

      oscFundamental.stop(startTime + 4.4);
      oscMetallicOvertones.stop(startTime + 4.4);
      oscHarmonic3.stop(startTime + 4.4);
    } catch (e) {
      void e;
    }
  }

  /**
   * 2. FELT PIANO (Piano com Martelo de Feltro Macio)
   * Timbre íntimo, quente e aveludado, com espaço generoso entre notas.
   */
  private triggerFeltPianoNote(
    frequency: number,
    startTime: number,
    pan: number,
    velocity = 1.0,
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const noteGain = ctx.createGain();

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(frequency, startTime);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(frequency * 2, startTime);

      const feltFilter = ctx.createBiquadFilter();
      feltFilter.type = "lowpass";
      feltFilter.frequency.setValueAtTime(420, startTime);
      feltFilter.frequency.exponentialRampToValueAtTime(
        Math.min(1800, frequency * 2.5),
        startTime + 0.04,
      );
      feltFilter.frequency.exponentialRampToValueAtTime(
        Math.max(300, frequency * 1.05),
        startTime + 2.0,
      );
      feltFilter.Q.setValueAtTime(1.2, startTime);

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.24, startTime);
      osc2.connect(osc2Gain);
      osc2Gain.connect(feltFilter);

      osc1.connect(feltFilter);
      feltFilter.connect(noteGain);

      const peakGain = 0.088 * velocity;
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.026);
      noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.40, startTime + 0.7);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 3.6);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        noteGain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.48, startTime);
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
      } else {
        noteGain.connect(this.musicGain);
      }

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + 3.8);
      osc2.stop(startTime + 3.8);
    } catch (e) {
      void e;
    }
  }

  /**
   * 3. LOW CELLO & DOUBLE BASS (Arco Acústico Lento & Ressonância de Madeira)
   * Fricção suave de crina de cavalo no arco, vibrato tardio expressivo e ancoragem nobre.
   */
  private triggerBowedCelloBass(
    frequency: number,
    startTime: number,
    duration: number,
    isDoubleBass = false,
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const bassGain = ctx.createGain();
      const bodyFilter = ctx.createBiquadFilter();

      const oscBody = ctx.createOscillator();
      oscBody.type = "sawtooth";
      oscBody.frequency.setValueAtTime(frequency, startTime);

      // Micro-vibrato tardio (entra suavemente após 0.9s de arco sustentado)
      const vibratoOsc = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibratoOsc.frequency.setValueAtTime(4.6, startTime);
      vibratoGain.gain.setValueAtTime(0.0001, startTime);
      vibratoGain.gain.linearRampToValueAtTime(1.8, startTime + 1.2);
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(oscBody.frequency);
      vibratoOsc.start(startTime);
      vibratoOsc.stop(startTime + duration);

      // Formante de caixa de cello / contrabaixo acústico
      bodyFilter.type = "lowpass";
      bodyFilter.frequency.setValueAtTime(isDoubleBass ? 280 : 420, startTime);
      bodyFilter.Q.setValueAtTime(1.8, startTime);

      // Ataque de arco lento e orgânico (1.4s de crescendo)
      const peak = isDoubleBass ? 0.082 : 0.075;
      bassGain.gain.setValueAtTime(0.0001, startTime);
      bassGain.gain.linearRampToValueAtTime(peak, startTime + 1.4);
      bassGain.gain.setValueAtTime(peak, startTime + duration - 2.8);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      oscBody.connect(bodyFilter);
      bodyFilter.connect(bassGain);
      bassGain.connect(this.musicGain);

      if (this.musicReverbNode) {
        const revSend = ctx.createGain();
        revSend.gain.setValueAtTime(0.38, startTime);
        bassGain.connect(revSend);
        revSend.connect(this.musicReverbNode);
      }

      oscBody.start(startTime);
      oscBody.stop(startTime + duration + 0.1);
    } catch (e) {
      void e;
    }
  }

  /**
   * 4. SOFT VIOLA & CELLO SUSTAINS (Chamber Strings)
   * Cordas de câmara suaves, quentes e respirantes sem tom dramático ou piegas.
   */
  private triggerChamberStringSustain(
    chord: number[],
    startTime: number,
    duration: number,
    voiceCollector: (OscillatorNode | AudioBufferSourceNode)[],
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const stringsGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(620, startTime);
      filter.Q.setValueAtTime(1.1, startTime);

      stringsGain.gain.setValueAtTime(0.0001, startTime);
      stringsGain.gain.linearRampToValueAtTime(0.062, startTime + 2.8);
      stringsGain.gain.setValueAtTime(0.062, startTime + duration - 3.2);
      stringsGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      filter.connect(stringsGain);
      stringsGain.connect(this.musicGain);

      if (this.musicReverbNode) {
        const revSend = ctx.createGain();
        revSend.gain.setValueAtTime(0.50, startTime);
        stringsGain.connect(revSend);
        revSend.connect(this.musicReverbNode);
      }

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, startTime);
        const detune = (idx % 2 === 0 ? 1 : -1) * 3.8;
        osc.detune.setValueAtTime(detune, startTime);

        osc.connect(filter);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
        voiceCollector.push(osc);
      });
    } catch (e) {
      void e;
    }
  }

  /**
   * 5. LOW WOODEN FLUTE (Flauta Baixa de Madeira)
   * Timbre ancestral e suave com ruído de ar e ataque expressivo.
   */
  private triggerWoodenFlute(
    frequency: number,
    startTime: number,
    pan: number,
    velocity = 1.0,
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const fluteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Oscilador de onda triangular suave
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      // Micro-slide ascendente na embocadura típico de flauta de madeira
      osc.frequency.setValueAtTime(frequency * 0.985, startTime);
      osc.frequency.exponentialRampToValueAtTime(frequency, startTime + 0.09);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency, startTime);
      filter.Q.setValueAtTime(2.8, startTime);

      // Ruído de sopro de ar (Breath noise)
      const noiseOsc = ctx.createOscillator();
      const noiseGain = ctx.createGain();
      noiseOsc.type = "sine";
      noiseOsc.frequency.setValueAtTime(frequency * 3.1, startTime);
      noiseGain.gain.setValueAtTime(0.015, startTime);
      noiseOsc.connect(noiseGain);
      noiseGain.connect(filter);

      const peak = 0.065 * velocity;
      fluteGain.gain.setValueAtTime(0.0001, startTime);
      fluteGain.gain.linearRampToValueAtTime(peak, startTime + 0.35);
      fluteGain.gain.setValueAtTime(peak, startTime + 1.8);
      fluteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.8);

      osc.connect(filter);
      filter.connect(fluteGain);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        fluteGain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.55, startTime);
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
      } else {
        fluteGain.connect(this.musicGain);
      }

      osc.start(startTime);
      noiseOsc.start(startTime);
      osc.stop(startTime + 3.0);
      noiseOsc.stop(startTime + 3.0);
    } catch (e) {
      void e;
    }
  }

  /**
   * 6. CELESTA (Cristalina & Precisa)
   */
  private triggerCelestaNote(frequency: number, startTime: number, pan: number): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const noteGain = ctx.createGain();

      const bellOsc1 = ctx.createOscillator();
      bellOsc1.type = "sine";
      bellOsc1.frequency.setValueAtTime(frequency, startTime);

      const bellOsc2 = ctx.createOscillator();
      bellOsc2.type = "sine";
      bellOsc2.frequency.setValueAtTime(frequency * 2.01, startTime);

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(600, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.052, startTime + 0.006);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.5);

      bellOsc1.connect(filter);
      bellOsc2.connect(filter);
      filter.connect(noteGain);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        noteGain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.65, startTime);
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
      } else {
        noteGain.connect(this.musicGain);
      }

      bellOsc1.start(startTime);
      bellOsc2.start(startTime);
      bellOsc1.stop(startTime + 2.6);
      bellOsc2.stop(startTime + 2.6);
    } catch (e) {
      void e;
    }
  }

  /**
   * 7. SPARSE HARP (Harpa Dedilhada Discreta)
   */
  private triggerSparseHarp(notes: number[], startTime: number, panBase: number): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    notes.forEach((freq, idx) => {
      try {
        const ctx = this.ctx!;
        const noteTime = startTime + idx * 0.09;
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, noteTime);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1350, noteTime);
        filter.Q.setValueAtTime(1.6, noteTime);

        noteGain.gain.setValueAtTime(0.0001, noteTime);
        noteGain.gain.linearRampToValueAtTime(0.040, noteTime + 0.012);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.8);

        osc.connect(filter);
        filter.connect(noteGain);

        if (typeof ctx.createStereoPanner === "function") {
          const panner = ctx.createStereoPanner();
          const pan = panBase + (idx - notes.length / 2) * 0.14;
          panner.pan.setValueAtTime(Math.max(-0.6, Math.min(0.6, pan)), noteTime);
          noteGain.connect(panner);
          panner.connect(this.musicGain);

          if (this.musicReverbNode) {
            const revSend = ctx.createGain();
            revSend.gain.setValueAtTime(0.48, noteTime);
            panner.connect(revSend);
            revSend.connect(this.musicReverbNode);
          }
        } else {
          noteGain.connect(this.musicGain);
        }

        osc.start(noteTime);
        osc.stop(noteTime + 1.9);
      } catch (e) {
        void e;
      }
    });
  }

  /**
   * 8. WARM ANALOG SYNTHESIZER (Pad Quente & Acolhedor)
   */
  private triggerAnalogWarmSynth(
    chord: number[],
    startTime: number,
    duration: number,
    voiceCollector: (OscillatorNode | AudioBufferSourceNode)[],
  ): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const padGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(500, startTime);
      filter.frequency.linearRampToValueAtTime(1250, startTime + duration * 0.45);
      filter.frequency.exponentialRampToValueAtTime(450, startTime + duration);
      filter.Q.setValueAtTime(1.5, startTime);

      padGain.gain.setValueAtTime(0.0001, startTime);
      padGain.gain.linearRampToValueAtTime(0.10, startTime + 2.6);
      padGain.gain.setValueAtTime(0.10, startTime + duration - 3.2);
      padGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      filter.connect(padGain);
      padGain.connect(this.musicGain);

      if (this.musicReverbNode) {
        const revSend = ctx.createGain();
        revSend.gain.setValueAtTime(0.36, startTime);
        padGain.connect(revSend);
        revSend.connect(this.musicReverbNode);
      }

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        const detune = (idx - chord.length / 2) * 3.5;
        osc.detune.setValueAtTime(detune, startTime);

        osc.connect(filter);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
        voiceCollector.push(osc);
      });
    } catch (e) {
      void e;
    }
  }

  /**
   * 9. RESTRAINED RESONANT METALLIC PERCUSSION (Tuned Bronze / Anvil Chime)
   * Toque único e majestoso que ecoa longamente no espaço tridimensional.
   */
  private triggerResonantMetallicPercussion(frequency: number, startTime: number, pan: number): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const chimeGain = ctx.createGain();

      const oscMode1 = ctx.createOscillator();
      oscMode1.type = "sine";
      oscMode1.frequency.setValueAtTime(frequency, startTime);

      const oscMode2 = ctx.createOscillator();
      oscMode2.type = "sine";
      oscMode2.frequency.setValueAtTime(frequency * 2.756, startTime); // modo inharmônico de metal

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency * 1.5, startTime);
      filter.Q.setValueAtTime(4.5, startTime);

      chimeGain.gain.setValueAtTime(0.0001, startTime);
      chimeGain.gain.linearRampToValueAtTime(0.052, startTime + 0.008);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 4.8); // cauda longa

      oscMode1.connect(chimeGain);
      oscMode2.connect(filter);
      filter.connect(chimeGain);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        chimeGain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.70, startTime); // envio generoso para o reverb
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
      } else {
        chimeGain.connect(this.musicGain);
      }

      oscMode1.start(startTime);
      oscMode2.start(startTime);
      oscMode1.stop(startTime + 5.0);
      oscMode2.stop(startTime + 5.0);
    } catch (e) {
      void e;
    }
  }

  /**
   * 10. GRANULAR AMBIENT TEXTURE (Reflexos Sutis de Luz em Aço)
   */
  private triggerGranularAmbientTexture(frequency: number, startTime: number, pan: number): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startTime);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency, startTime);
      filter.Q.setValueAtTime(4.2, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.022, startTime + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 3.0);

      osc.connect(filter);
      filter.connect(gain);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        gain.connect(panner);
        panner.connect(this.musicGain);

        if (this.musicReverbNode) {
          const revSend = ctx.createGain();
          revSend.gain.setValueAtTime(0.55, startTime);
          panner.connect(revSend);
          revSend.connect(this.musicReverbNode);
        }
      } else {
        gain.connect(this.musicGain);
      }

      osc.start(startTime);
      osc.stop(startTime + 3.2);
    } catch (e) {
      void e;
    }
  }

  /**
   * Pulso Tecnológico de Precisão (Clock de Engenharia Discreto)
   */
  private triggerTechPulse(): void {
    if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;

    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      this.pulseStep++;
      const pan = this.pulseStep % 2 === 0 ? -0.18 : 0.18;

      osc.type = "sine";
      osc.frequency.setValueAtTime(1300, now);
      osc.frequency.exponentialRampToValueAtTime(650, now + 0.022);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1050, now);
      filter.Q.setValueAtTime(2.8, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.016, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

      osc.connect(filter);
      filter.connect(gain);

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, now);
        gain.connect(panner);
        panner.connect(this.musicGain);
      } else {
        gain.connect(this.musicGain);
      }

      osc.start(now);
      osc.stop(now + 0.035);
    } catch (e) {
      void e;
    }
  }
}

export const audioManager = AudioManager.getInstance();
