import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio.service';

function mockGainNode(): any {
  return {
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
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
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockAudioContext(): any {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: mockGainNode(),
    resume: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => mockGainNode()),
    createOscillator: vi.fn(() => mockOscillatorNode()),
    createBufferSource: vi.fn(() => mockBufferSourceNode()),
    decodeAudioData: vi.fn(() => Promise.resolve({ duration: 0.1 })),
  };
}

describe('AudioService', () => {
  let service: AudioService;
  let mockCtx: any;

  beforeEach(() => {
    localStorage.clear();
    mockCtx = createMockAudioContext();
    vi.stubGlobal('AudioContext', function(this: any) {
      Object.assign(this, mockCtx);
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })));

    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have default volume signals', () => {
    expect(service.masterVolume()).toBe(0.7);
    expect(service.sfxVolume()).toBe(0.8);
    expect(service.musicVolume()).toBe(0.5);
    expect(service.muted()).toBe(false);
  });

  describe('ensureContext', () => {
    it('should create AudioContext on first call', async () => {
      await service.ensureContext();
      expect(service).toBeTruthy();
    });

    it('should not throw on subsequent calls', async () => {
      await service.ensureContext();
      await service.ensureContext();
      expect(service).toBeTruthy();
    });
  });

  describe('playClick', () => {
    it('should no-op before ensureContext', () => {
      service.playClick();
      expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    });

    it('should create buffer source after ensureContext', async () => {
      await service.ensureContext();
      // Wait for loadClickBuffer to complete
      await vi.waitFor(() => expect(mockCtx.decodeAudioData).toHaveBeenCalled());
      service.playClick();
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
    });
  });

  describe('stub methods', () => {
    it('should not throw when called', () => {
      service.playDiscovery();
    });
  });

  describe('localStorage persistence', () => {
    it('should persist preferences when volume changes', async () => {
      service.masterVolume.set(0.5);
      TestBed.flushEffects();
      const stored = JSON.parse(localStorage.getItem('stellar-hex-audio')!);
      expect(stored.masterVolume).toBe(0.5);
    });

    it('should load persisted preferences', () => {
      localStorage.setItem('stellar-hex-audio', JSON.stringify({
        masterVolume: 0.3, sfxVolume: 0.4, musicVolume: 0.6, muted: true,
      }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const fresh = TestBed.inject(AudioService);
      expect(fresh.masterVolume()).toBe(0.3);
      expect(fresh.sfxVolume()).toBe(0.4);
      expect(fresh.musicVolume()).toBe(0.6);
      expect(fresh.muted()).toBe(true);
    });
  });
});
