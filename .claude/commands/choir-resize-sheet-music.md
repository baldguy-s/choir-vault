# choir-resize-sheet-music

Resize and optimize a sheet music image for upload.

## Usage

```
/choir-resize-sheet-music <input-file> [output-file]
```

If `output-file` is omitted, write to the same directory with `-web.jpg` appended before the extension.

## What this does

Uses ffmpeg (or ImageMagick if available) to produce a JPEG that is:
- Auto-rotated based on EXIF orientation data
- Resized so the long edge is at most **1600px** (preserve aspect ratio)
- Compressed to JPEG quality 85 — enough for legible printed notation, not a
  pixel-perfect archive
- Stripped of EXIF metadata (no GPS or personal data in the repo)

### With ffmpeg

```bash
ffmpeg -i "<input>" \
  -vf "scale='if(gt(iw,ih),1600,-2)':'if(gt(iw,ih),-2,1600)',transpose=if(gte(rotation\,45)*lt(rotation\,135)\,1\,if(gte(rotation\,135)*lt(rotation\,225)\,2\,if(gte(rotation\,225)*lt(rotation\,315)\,3\,0)))" \
  -q:v 4 -map_metadata -1 \
  "<output>"
```

If the auto-rotation logic is unreliable on the platform, fall back to:

```bash
ffmpeg -i "<input>" -vf "scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease" -q:v 4 -map_metadata -1 "<output>"
```

### With ImageMagick (preferred for EXIF rotation)

```bash
magick convert "<input>" -auto-orient -resize "1600x1600>" -quality 85 -strip "<output>"
```

Check for `magick` first, fall back to `ffmpeg` if not found.

## Prerequisites

Either ImageMagick (`magick -version`) or ffmpeg (`ffmpeg -version`) must be installed. If neither is available, tell the user.

## Output

Report input dimensions, output dimensions, input file size, and output file size. If the output exceeds 2 MB, warn — a 1600px JPEG at quality 85 should compress well below that for printed notation.
