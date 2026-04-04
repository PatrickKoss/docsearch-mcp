import fs from 'node:fs/promises';
import path from 'node:path';

import { CONFIG } from '../../shared/config.js';

export interface TranscriptSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface MediaMetadata {
  format: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  artist?: string;
  album?: string;
  title?: string;
  trackNumber?: number;
  genre?: string;
  isAudio: boolean;
}

export interface AudioVideoParseResult {
  readonly transcript: string | null;
  readonly segments: TranscriptSegment[] | null;
  readonly metadata: MediaMetadata;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB Whisper API limit

export async function parseAudioVideo(filePath: string): Promise<AudioVideoParseResult> {
  const metadata = await extractMediaMetadata(filePath);

  let transcript: string | null = null;
  let segments: TranscriptSegment[] | null = null;

  if (CONFIG.ENABLE_AUDIO_TRANSCRIPTION) {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      console.warn(
        `File ${filePath} is ${Math.round(stat.size / 1024 / 1024)}MB, exceeds 25MB Whisper limit. Skipping transcription.`,
      );
    } else {
      try {
        const result = await transcribeWithWhisper(filePath);
        transcript = result.text;
        segments = result.segments;
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Whisper transcription failed for ${filePath}:`, error);
        }
      }
    }
  }

  return { transcript, segments, metadata };
}

async function extractMediaMetadata(filePath: string): Promise<MediaMetadata> {
  const mm = await import('music-metadata');
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const audioExts = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac']);
  const isAudio = audioExts.has(ext);

  try {
    const parsed = await mm.parseFile(filePath);
    const meta: MediaMetadata = { format: ext, isAudio };
    if (parsed.format.duration != null) {
      meta.duration = parsed.format.duration;
    }
    if (parsed.format.bitrate != null) {
      meta.bitrate = parsed.format.bitrate;
    }
    if (parsed.format.sampleRate != null) {
      meta.sampleRate = parsed.format.sampleRate;
    }
    if (parsed.format.codec) {
      meta.codec = parsed.format.codec;
    }
    if (parsed.common.artist) {
      meta.artist = parsed.common.artist;
    }
    if (parsed.common.album) {
      meta.album = parsed.common.album;
    }
    if (parsed.common.title) {
      meta.title = parsed.common.title;
    }
    if (parsed.common.track?.no != null) {
      meta.trackNumber = parsed.common.track.no;
    }
    if (parsed.common.genre?.[0]) {
      meta.genre = parsed.common.genre[0];
    }
    return meta;
  } catch {
    return { format: ext, isAudio };
  }
}

interface WhisperResponse {
  readonly text: string;
  readonly segments?: Array<{
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }>;
}

async function transcribeWithWhisper(
  filePath: string,
): Promise<{ text: string; segments: TranscriptSegment[] }> {
  const { fetch } = await import('undici');

  const apiKey = CONFIG.WHISPER_API_KEY;
  if (!apiKey) {
    throw new Error('WHISPER_API_KEY (or OPENAI_API_KEY) is required for audio transcription');
  }

  const baseUrl = CONFIG.WHISPER_BASE_URL || 'https://api.openai.com/v1';
  const model = CONFIG.WHISPER_MODEL;

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), fileName);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: formData as any,
    });

    if (response.status === 429 && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as WhisperResponse;
    const segments: TranscriptSegment[] = (data.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));

    return {
      text: data.text,
      segments,
    };
  }

  throw new Error('Whisper API: max retries exceeded');
}
