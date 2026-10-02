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

  // Motor da Trilha Sonora Ambiente (Generative Pad Synthesizer)
  private isMusicPlaying = false;
  private ambientTimer: number | null = null;
  private currentChordIndex = 0;
  private activeVoices: { oscs: OscillatorNode[]; gain: GainNode }[] = [];
  private noiseNode: AudioBufferSourceNode | null = null;

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
    } catch {}
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
  // TRILHA SONORA AMBIENTE PROCEDURAL ("CALDRA SPATIAL ATMOSPHERE")
  // =========================================================================
  // Sintetizador de pads polifônicos lentos com filtros ressonantes,
  // espacialidade estéreo e harmonia minimalista nostálgica (estilo PS2).
  // Sem cortes perceptíveis, loop perfeito contínuo entre telas.

  public playMusic(trackId = "caldra_main"): void {
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

    // Suaviza e cessa vozes ativas
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices.forEach((v) => {
        try {
          v.gain.gain.setTargetAtTime(0.0001, now, 0.4);
          window.setTimeout(() => {
            v.oscs.forEach((o) => {
              try {
                o.stop();
              } catch {}
            });
          }, 800);
        } catch {}
      });
      this.activeVoices = [];
    }
  }

  private startAmbientEngine(): void {
    if (!this.ctx || !this.isMusicPlaying) return;

    // Progressão harmônica minimalista espacial (acordes amplos e limpos)
    // Dm9 -> Bbmaj7#11 -> Fsus2 -> Asus4/7
    const chords: number[][] = [
      [146.83, 220.0, 261.63, 329.63, 349.23], // D3, A3, C4, E4, F4
      [116.54, 174.61, 220.0, 261.63, 329.63], // Bb2, F3, A3, C4, E4
      [87.31, 130.81, 196.0, 220.0, 261.63],  // F2, C3, G3, A3, C4
      [110.0, 164.81, 196.0, 293.66, 329.63],  // A2, E3, G3, D4, E4
    ];

    const CHORD_DURATION = 9.0; // 9 segundos por acorde com 3.5s de crossfade
    this.currentChordIndex = 0;

    const playNextChord = () => {
      if (!this.isMusicPlaying || !this.ctx) return;

      const chordNotes = chords[this.currentChordIndex];
      this.currentChordIndex = (this.currentChordIndex + 1) % chords.length;

      this.triggerAmbientChord(chordNotes, CHORD_DURATION);
    };

    // Toca o primeiro imediatamente
    playNextChord();

    // Agenda os próximos suavemente
    this.ambientTimer = window.setInterval(playNextChord, (CHORD_DURATION - 2.8) * 1000);
  }

  private triggerAmbientChord(frequencies: number[], duration: number): void {
    if (!this.ctx || !this.musicGain) return;

    const now = this.ctx.currentTime;
    const oscs: OscillatorNode[] = [];

    // Nó de ganho geral deste acorde
    const chordGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Filtro analógico passa-baixas com abertura lenta
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(1400, now + duration * 0.4);
    filter.frequency.exponentialRampToValueAtTime(500, now + duration);
    filter.Q.setValueAtTime(2.5, now);

    // Envelope de ganho lento e suave (sem cliques)
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.linearRampToValueAtTime(0.22, now + 2.8);
    chordGain.gain.setValueAtTime(0.22, now + duration - 2.8);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    filter.connect(chordGain);
    chordGain.connect(this.musicGain);

    // Osciladores para cada nota do acorde
    frequencies.forEach((freq, idx) => {
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      // Alterna entre senoidal pura e triângulo para dar calor analógico
      osc.type = idx % 2 === 0 ? "sine" : "triangle";

      // Micro detune estéreo para espacialidade
      const detune = (idx - 2) * 5;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune, now);

      osc.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.1);
      oscs.push(osc);
    });

    const voice = { oscs, gain: chordGain };
    this.activeVoices.push(voice);

    // Limpeza após o fim do acorde
    window.setTimeout(() => {
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) {
        this.activeVoices.splice(idx, 1);
      }
    }, (duration + 0.5) * 1000);
  }
}

export const audioManager = AudioManager.getInstance();
