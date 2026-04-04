import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock music-metadata
vi.mock('music-metadata', () => ({
  parseFile: vi.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('invalid')) {
      throw new Error('Failed to parse media file');
    }
    if (filePath.includes('minimal')) {
      return Promise.resolve({
        format: { duration: 120 },
        common: {},
      });
    }
    return Promise.resolve({
      format: {
        duration: 245.5,
        bitrate: 320000,
        sampleRate: 44100,
        codec: 'MPEG 1 Layer 3',
      },
      common: {
        artist: 'Test Artist',
        album: 'Test Album',
        title: 'Test Song',
        track: { no: 5 },
        genre: ['Rock'],
      },
    });
  }),
}));

// Mock undici fetch for Whisper API tests
vi.mock('undici', () => ({
  fetch: vi.fn().mockImplementation((_url: string, _options: any) => {
    if (_url.includes('error-api')) {
      return Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          text: 'This is the transcribed text from the audio file.',
          segments: [
            { start: 0, end: 5.5, text: ' This is the transcribed' },
            { start: 5.5, end: 12.0, text: ' text from the audio file.' },
          ],
        }),
    });
  }),
}));

// Mock config
vi.mock('../../src/shared/config.js', () => ({
  CONFIG: {
    ENABLE_AUDIO_TRANSCRIPTION: false,
    WHISPER_API_KEY: 'test-key',
    WHISPER_BASE_URL: 'https://api.openai.com/v1',
    WHISPER_MODEL: 'whisper-1',
  },
}));

import { parseAudioVideo } from '../../src/ingest/parsers/audio-video.js';
import { CONFIG } from '../../src/shared/config.js';

const fixturesDir = './test/fixtures-audio';

describe('Audio/Video Parsing', () => {
  beforeEach(() => {
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
    mkdirSync(fixturesDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(fixturesDir)) {
      rmSync(fixturesDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('metadata extraction', () => {
    it('should extract full metadata from MP3 with ID3 tags', async () => {
      const filePath = path.join(fixturesDir, 'song.mp3');
      writeFileSync(filePath, 'fake-mp3-data');

      const result = await parseAudioVideo(filePath);

      expect(result.metadata.format).toBe('mp3');
      expect(result.metadata.isAudio).toBe(true);
      expect(result.metadata.duration).toBeCloseTo(245.5);
      expect(result.metadata.bitrate).toBe(320000);
      expect(result.metadata.sampleRate).toBe(44100);
      expect(result.metadata.codec).toBe('MPEG 1 Layer 3');
      expect(result.metadata.artist).toBe('Test Artist');
      expect(result.metadata.album).toBe('Test Album');
      expect(result.metadata.title).toBe('Test Song');
      expect(result.metadata.trackNumber).toBe(5);
      expect(result.metadata.genre).toBe('Rock');
      expect(result.transcript).toBeNull();
      expect(result.segments).toBeNull();
    });

    it('should extract minimal metadata from video', async () => {
      const filePath = path.join(fixturesDir, 'minimal.mp4');
      writeFileSync(filePath, 'fake-video-data');

      const result = await parseAudioVideo(filePath);

      expect(result.metadata.format).toBe('mp4');
      expect(result.metadata.isAudio).toBe(false);
      expect(result.metadata.duration).toBe(120);
      expect(result.metadata.artist).toBeUndefined();
    });

    it('should handle metadata extraction failure gracefully', async () => {
      const filePath = path.join(fixturesDir, 'invalid.wav');
      writeFileSync(filePath, 'invalid-data');

      const result = await parseAudioVideo(filePath);

      expect(result.metadata.format).toBe('wav');
      expect(result.metadata.isAudio).toBe(true);
      expect(result.metadata.duration).toBeUndefined();
    });

    it('should classify audio vs video correctly', async () => {
      const audioPath = path.join(fixturesDir, 'song.flac');
      writeFileSync(audioPath, 'fake-flac-data');
      const audioResult = await parseAudioVideo(audioPath);
      expect(audioResult.metadata.isAudio).toBe(true);

      const videoPath = path.join(fixturesDir, 'minimal.webm');
      writeFileSync(videoPath, 'fake-webm-data');
      const videoResult = await parseAudioVideo(videoPath);
      expect(videoResult.metadata.isAudio).toBe(false);
    });
  });

  describe('transcription disabled', () => {
    it('should not transcribe when ENABLE_AUDIO_TRANSCRIPTION is false', async () => {
      const filePath = path.join(fixturesDir, 'song.mp3');
      writeFileSync(filePath, 'fake-mp3-data');

      const result = await parseAudioVideo(filePath);

      expect(result.transcript).toBeNull();
      expect(result.segments).toBeNull();
    });
  });

  describe('transcription enabled', () => {
    beforeEach(() => {
      // Enable transcription
      Object.defineProperty(CONFIG, 'ENABLE_AUDIO_TRANSCRIPTION', { value: true, writable: true });
    });

    afterEach(() => {
      Object.defineProperty(CONFIG, 'ENABLE_AUDIO_TRANSCRIPTION', { value: false, writable: true });
    });

    it('should transcribe audio file with Whisper API', async () => {
      const filePath = path.join(fixturesDir, 'song.mp3');
      writeFileSync(filePath, 'fake-mp3-data');

      const result = await parseAudioVideo(filePath);

      expect(result.transcript).toBe('This is the transcribed text from the audio file.');
      expect(result.segments).toHaveLength(2);
      expect(result.segments![0]!.start).toBe(0);
      expect(result.segments![0]!.end).toBe(5.5);
      expect(result.segments![0]!.text).toContain('This is the transcribed');
    });

    it('should skip transcription for files over 25MB', async () => {
      const filePath = path.join(fixturesDir, 'huge.mp3');
      // Create a file just over 25MB
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024, 'x');
      writeFileSync(filePath, largeBuffer);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await parseAudioVideo(filePath);

      expect(result.transcript).toBeNull();
      expect(result.segments).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds 25MB Whisper limit'));
    });
  });
});
