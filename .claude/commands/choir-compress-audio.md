# choir-compress-audio

Compress a raw audio file into a practice-track MP3 suitable for upload.

## Usage

```
/choir-compress-audio <input-file> [output-file]
```

If `output-file` is omitted, write to the same directory as the input with a `.mp3` extension.

## What this does

Uses ffmpeg to produce a 128kbps mono MP3 with:
- Volume normalized (loudnorm filter)
- Silence trimmed from start and end (silenceremove filter)
- ID3 tags stripped (no metadata leakage)

### Command

```bash
ffmpeg -i "<input>" \
  -af "silenceremove=start_periods=1:start_silence=0.5:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.5:start_threshold=-50dB,areverse,loudnorm" \
  -b:a 128k -ac 1 -map_metadata -1 \
  "<output>"
```

## Prerequisites

ffmpeg must be installed and on PATH. Check with `ffmpeg -version`. If missing, tell the user to install it:
- Windows: `winget install ffmpeg` or download from ffmpeg.org
- macOS: `brew install ffmpeg`

## Output

Report the input file size, output file size, and duration of the compressed file.

If the output exceeds 10 MB, warn the user — a 128kbps mono MP3 should never be that large for a practice track, which suggests the source may be very long or something went wrong.
