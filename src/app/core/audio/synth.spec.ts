import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNoiseBuffer,
  playClick,
  playUnitSelect,
  playMovement,
  playLaserZap,
  playImpactThud,
  playBuild,
  playProduce,
  playEndTurn,
  playDiscovery,
  playError,
  playStartGame,
  startMenuAmbient,
  startGameAmbient,
} from './synth';

// Minimal mock AudioContext for testing node creation patterns
function mockGainNode(): any {
  return {
    gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  };
}

function mockOscillatorNode(): any {
  return {
    type: 'sine',
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function mockBufferSourceNode(): any {
  return {
    buffer: null,
    loop: false,
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function mockBiquadFilterNode(): any {
  return {
    type: 'lowpass',
    frequency: { value: 0, setValueAtTime: vi.fn() },
    Q: { value: 0 },
    connect: vi.fn().mockReturnThis(),
  };
}

function createMockAudioContext(): any {
  return {
    currentTime: 0,
    sampleRate: 44100,
    createOscillator: vi.fn(() => mockOscillatorNode()),
    createGain: vi.fn(() => mockGainNode()),
    createBufferSource: vi.fn(() => mockBufferSourceNode()),
    createBiquadFilter: vi.fn(() => mockBiquadFilterNode()),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
      length,
      sampleRate,
    })),
  };
}

describe('synth', () => {
  let ctx: any;
  let dest: any;

  beforeEach(() => {
    ctx = createMockAudioContext();
    dest = mockGainNode();
  });

  describe('createNoiseBuffer', () => {
    it('should create a buffer with correct length', () => {
      const buffer = createNoiseBuffer(ctx, 2);
      expect(ctx.createBuffer).toHaveBeenCalledWith(1, 44100 * 2, 44100);
      expect(buffer).toBeDefined();
    });
  });

  describe('playClick', () => {
    it('should create an oscillator and gain node', () => {
      playClick(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
      expect(ctx.createGain).toHaveBeenCalledTimes(1);
    });
  });

  describe('playUnitSelect', () => {
    it('should create two oscillators for the two-tone beep', () => {
      playUnitSelect(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
      expect(ctx.createGain).toHaveBeenCalledTimes(1);
    });
  });

  describe('playMovement', () => {
    it('should return a GainNode handle', () => {
      const result = playMovement(ctx, dest, 300);
      expect(result).toBeDefined();
      expect(result.gain).toBeDefined();
    });

    it('should create oscillator, noise buffer source, and LFO', () => {
      playMovement(ctx, dest, 300);
      // 1 saw + 1 LFO = 2 oscillators
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('playLaserZap', () => {
    it('should create oscillator with frequency sweep', () => {
      playLaserZap(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
      const osc = ctx.createOscillator.mock.results[0].value;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(200, 0.2);
    });
  });

  describe('playImpactThud', () => {
    it('should create a sine oscillator and noise source', () => {
      playImpactThud(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('playBuild', () => {
    it('should create 3 square oscillators + noise', () => {
      playBuild(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('playProduce', () => {
    it('should create 3 triangle oscillators for C5-E5-G5', () => {
      playProduce(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    });
  });

  describe('playEndTurn', () => {
    it('should create 4 oscillators for ascending chime', () => {
      playEndTurn(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(4);
    });
  });

  describe('playDiscovery', () => {
    it('should create 2 oscillators for beating effect', () => {
      playDiscovery(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    });
  });

  describe('playError', () => {
    it('should create square oscillator + LFO', () => {
      playError(ctx, dest);
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    });
  });

  describe('playStartGame', () => {
    it('should create saw + sine sweeps + hit oscillator', () => {
      playStartGame(ctx, dest);
      // saw + sine + hitOsc = 3
      expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    });
  });

  describe('startMenuAmbient', () => {
    it('should return an AmbientHandle with stop and gainNode', () => {
      const handle = startMenuAmbient(ctx, dest);
      expect(handle.stop).toBeInstanceOf(Function);
      expect(handle.gainNode).toBeDefined();
    });

    it('should create saw + noise + LFO nodes', () => {
      startMenuAmbient(ctx, dest);
      // saw + LFO = 2 oscillators
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('stop should schedule fade-out', () => {
      const handle = startMenuAmbient(ctx, dest);
      handle.stop(1000);
      expect(handle.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalled();
    });
  });

  describe('startGameAmbient', () => {
    it('should return an AmbientHandle with stop and gainNode', () => {
      vi.useFakeTimers();
      const handle = startGameAmbient(ctx, dest);
      expect(handle.stop).toBeInstanceOf(Function);
      expect(handle.gainNode).toBeDefined();
      handle.stop(0);
      vi.useRealTimers();
    });

    it('should create noise + sub + subLfo nodes', () => {
      vi.useFakeTimers();
      startGameAmbient(ctx, dest).stop(0);
      // sub + subLfo = 2 oscillators
      expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('stop should clear ping timeout and fade out', () => {
      vi.useFakeTimers();
      const handle = startGameAmbient(ctx, dest);
      handle.stop(500);
      expect(handle.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
