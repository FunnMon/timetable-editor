# Local OCR assets

Models: `chi_sim.traineddata` and `eng.traineddata` from
https://github.com/tesseract-ocr/tessdata_best (downloaded 2026-09-06).
License: Apache-2.0, included in LICENSE-models.

Runtime files are copied from the exact npm versions in package-lock.json by
scripts/prepare-ocr.mjs before development and production builds. Runtime and
models are served from this website. The user's PNG stays in their browser.
