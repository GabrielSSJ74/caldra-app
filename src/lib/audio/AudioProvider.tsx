import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  audioManager,
  AudioManager,
  type AudioSettingsState,
  type SoundEffectId,
} from "./AudioManager";

interface AudioContextValue extends AudioSettingsState {
  play: (soundId: SoundEffectId) => void;
  playMusic: (trackId?: string) => void;
  stopMusic: () => void;
  setMasterVolume: (val: number) => void;
  setMusicVolume: (val: number) => void;
  setEffectsVolume: (val: number) => void;
  setUiVolume: (val: number) => void;
  toggleMute: () => boolean;
  setSilentMode: (silent: boolean) => void;
  setVolumePreset: (preset: "mute" | "low" | "mid" | "high") => void;
  toggleUiSounds: () => void;
  toggleCadEffects: () => void;
  toggleMusic: () => void;
  toggleSelectionSounds: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioSettingsState>(() => audioManager.getSettings());

  useEffect(() => {
    return audioManager.subscribe((newSettings) => {
      setState(newSettings);
    });
  }, []);

  const play = useCallback((soundId: SoundEffectId) => {
    audioManager.play(soundId);
  }, []);

  const playMusic = useCallback((trackId?: string) => {
    audioManager.playMusic(trackId);
  }, []);

  const stopMusic = useCallback(() => {
    audioManager.stopMusic();
  }, []);

  const setMasterVolume = useCallback((val: number) => {
    audioManager.setMasterVolume(val);
  }, []);

  const setMusicVolume = useCallback((val: number) => {
    audioManager.setMusicVolume(val);
  }, []);

  const setEffectsVolume = useCallback((val: number) => {
    audioManager.setEffectsVolume(val);
  }, []);

  const setUiVolume = useCallback((val: number) => {
    audioManager.setUiVolume(val);
  }, []);

  const toggleMute = useCallback(() => {
    return audioManager.toggleMute();
  }, []);

  const setSilentMode = useCallback((silent: boolean) => {
    audioManager.setSilentMode(silent);
  }, []);

  const setVolumePreset = useCallback((preset: "mute" | "low" | "mid" | "high") => {
    audioManager.setVolumePreset(preset);
  }, []);

  const toggleUiSounds = useCallback(() => {
    audioManager.toggleUiSounds();
  }, []);

  const toggleCadEffects = useCallback(() => {
    audioManager.toggleCadEffects();
  }, []);

  const toggleMusic = useCallback(() => {
    audioManager.toggleMusic();
  }, []);

  const toggleSelectionSounds = useCallback(() => {
    audioManager.toggleSelectionSounds();
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      play,
      playMusic,
      stopMusic,
      setMasterVolume,
      setMusicVolume,
      setEffectsVolume,
      setUiVolume,
      toggleMute,
      setSilentMode,
      setVolumePreset,
      toggleUiSounds,
      toggleCadEffects,
      toggleMusic,
      toggleSelectionSounds,
    }),
    [
      state,
      play,
      playMusic,
      stopMusic,
      setMasterVolume,
      setMusicVolume,
      setEffectsVolume,
      setUiVolume,
      toggleMute,
      setSilentMode,
      setVolumePreset,
      toggleUiSounds,
      toggleCadEffects,
      toggleMusic,
      toggleSelectionSounds,
    ],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    // Fallback gracioso se usado fora do Provider
    return {
      masterVolume: 0.8,
      musicVolume: 0.2,
      effectsVolume: 0.25,
      uiVolume: 0.3,
      isMuted: false,
      uiSoundsEnabled: true,
      cadEffectsEnabled: true,
      musicEnabled: true,
      selectionSoundsEnabled: true,
      play: (id) => AudioManager.play(id),
      playMusic: (t) => AudioManager.playMusic(t),
      stopMusic: () => AudioManager.stopMusic(),
      setMasterVolume: (v) => audioManager.setMasterVolume(v),
      setMusicVolume: (v) => audioManager.setMusicVolume(v),
      setEffectsVolume: (v) => audioManager.setEffectsVolume(v),
      setUiVolume: (v) => audioManager.setUiVolume(v),
      toggleMute: () => audioManager.toggleMute(),
      setSilentMode: (s) => audioManager.setSilentMode(s),
      setVolumePreset: (p) => audioManager.setVolumePreset(p),
      toggleUiSounds: () => audioManager.toggleUiSounds(),
      toggleCadEffects: () => audioManager.toggleCadEffects(),
      toggleMusic: () => audioManager.toggleMusic(),
      toggleSelectionSounds: () => audioManager.toggleSelectionSounds(),
    };
  }
  return ctx;
}
