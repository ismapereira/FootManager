/**
 * Gerenciador de áudio clássico leve via Web Audio API (Seção 10.3).
 * Sintetiza apito, gol, cartão e clique sem depender de arquivos binários externos na Fase 0.
 */

export type SoundEffectName = 'click' | 'whistle' | 'goal' | 'card';

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.6;

  public configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || !this.enabled || this.volume <= 0) {
      return null;
    }
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    gainScale = 0.25,
    delaySec = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
    }

    const peakGain = Math.max(0.001, this.volume * gainScale);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.02);
  }

  public play(effect: SoundEffectName): void {
    switch (effect) {
      case 'click':
        this.playTone(620, 480, 0.045, 'triangle', 0.14);
        break;
      case 'whistle':
        this.playTone(2850, 2720, 0.22, 'sine', 0.2);
        this.playTone(2920, 2650, 0.14, 'sine', 0.18, 0.25);
        break;
      case 'goal':
        this.playTone(523.25, 523.25, 0.12, 'triangle', 0.22, 0);
        this.playTone(659.25, 659.25, 0.12, 'triangle', 0.22, 0.11);
        this.playTone(783.99, 1046.5, 0.32, 'triangle', 0.26, 0.22);
        break;
      case 'card':
        this.playTone(340, 220, 0.18, 'sawtooth', 0.16);
        break;
    }
  }
}

export const soundManager = new SoundManager();
