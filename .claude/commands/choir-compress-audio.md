# choir-compress-audio

> **Note:** Audio compression is not used in this project. Files are uploaded at their original size and quality. This skill is retained for reference only — do not invoke it as part of the add-song workflow.

If compression is ever needed for a specific file (e.g. a source file is unusually large and the user explicitly requests it), use ffmpeg:

```bash
ffmpeg -i "<input>" -vn -b:a 128k -ac 1 -map_metadata -1 -y "<output>.mp3"
```

Always confirm with the user before compressing any file.
