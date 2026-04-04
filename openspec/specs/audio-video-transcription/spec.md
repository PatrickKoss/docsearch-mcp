## ADDED Requirements

### Requirement: Audio/video file detection

The system SHALL recognize common audio extensions (`.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`) and video extensions (`.mp4`, `.webm`, `.mkv`, `.avi`, `.mov`) and route them to the audio/video parser.

#### Scenario: Audio file in FILE_ROOT

- **WHEN** a file with a recognized audio extension is found during scanning
- **THEN** it is classified as an audio file and routed to the audio/video parser

#### Scenario: Video file in FILE_ROOT

- **WHEN** a file with a recognized video extension is found during scanning
- **THEN** it is classified as a video file and routed to the audio/video parser

### Requirement: Media metadata extraction

The system SHALL extract metadata from audio/video files using `music-metadata`. Metadata SHALL include duration, bitrate, sample rate, codec, and where available: artist, album, title, track number, genre. Metadata SHALL be stored in `extra_json`.

#### Scenario: Audio file with full metadata

- **WHEN** an MP3 file with ID3 tags (artist, album, title, genre) is ingested
- **THEN** all available metadata is extracted and stored in `extra_json`, and the document title is set from the metadata title (falling back to filename)

#### Scenario: Video file with minimal metadata

- **WHEN** a video file with only duration and codec info is ingested
- **THEN** available metadata is stored in `extra_json` and the filename is used as document title

### Requirement: Audio transcription via Whisper API

The system SHALL transcribe audio/video files using the OpenAI Whisper API (or compatible endpoint) when `ENABLE_AUDIO_TRANSCRIPTION` is set to `true`. The transcription SHALL include timestamps. The system SHALL use configuration variables `WHISPER_API_KEY` (defaults to `OPENAI_API_KEY`), `WHISPER_BASE_URL` (defaults to `OPENAI_BASE_URL`), and `WHISPER_MODEL` (defaults to `whisper-1`).

#### Scenario: Transcription enabled with valid API key

- **WHEN** `ENABLE_AUDIO_TRANSCRIPTION` is true and a valid API key is configured
- **THEN** audio/video files are sent to the Whisper API, and the returned transcript with timestamps is stored as chunks

#### Scenario: Transcription disabled

- **WHEN** `ENABLE_AUDIO_TRANSCRIPTION` is false (default)
- **THEN** audio/video files are indexed with metadata only (duration, format, etc.) and no transcript chunks are created

#### Scenario: Whisper API failure

- **WHEN** the Whisper API returns an error for a specific file
- **THEN** the system logs the error, stores the file with metadata only, and continues processing

### Requirement: File size limit for transcription

The system SHALL skip transcription for files larger than 25MB (Whisper API limit) and log a warning.

#### Scenario: Audio file over 25MB

- **WHEN** an audio file exceeds 25MB and transcription is enabled
- **THEN** the system logs a warning, indexes the file with metadata only, and skips transcription

### Requirement: Transcript chunking

The system SHALL implement a `chunkTranscript()` function that creates chunks from timestamped transcript segments. Each chunk SHALL include start and end timestamps in its metadata.

#### Scenario: Short transcript

- **WHEN** a transcript is shorter than the maximum chunk size
- **THEN** the entire transcript becomes a single chunk with start timestamp 0 and the final segment's end timestamp

#### Scenario: Long transcript

- **WHEN** a transcript exceeds the maximum chunk size
- **THEN** it is split at sentence boundaries between timestamp segments, with each chunk's metadata containing the time range it covers

### Requirement: Dynamic loading of media libraries

The system SHALL dynamically import `music-metadata` only when processing audio/video files.

#### Scenario: No audio/video files to process

- **WHEN** a file ingestion run encounters no audio or video files
- **THEN** `music-metadata` is never loaded
