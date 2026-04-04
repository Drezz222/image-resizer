# Squish — Image Resizer

A fast, private image resizer built for Vercel. Resize, convert and compress images server-side using Sharp. No sign-up, no file storage — images are processed and immediately discarded.

## Features

- **Resize by dimensions** — set width, height, or both with aspect ratio lock
- **Resize by percentage** — scale up or down with a slider
- **Social media presets** — Twitter, Instagram, Facebook, LinkedIn, OG image, and more
- **Format conversion** — JPEG, PNG, WebP, AVIF (with quality control)
- **Fit modes** — inside, cover, fill, contain
- **Before/After slider** — drag to compare original vs resized
- **Size stats** — see exactly how much space you saved

## Project Structure

```
image-resizer/
├── index.html        ← Frontend (served as static file)
├── api/
│   └── resize.js     ← Vercel serverless function (Sharp)
├── package.json
├── vercel.json
└── .gitignore
```

## Deploy to Vercel

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "initial commit"
gh repo create image-resizer --public --push

# 2. Import to Vercel at vercel.com/new
# Vercel auto-detects the api/ folder and installs Sharp
```

That's it. Vercel handles everything — Sharp binary, CDN, HTTPS.

## Local Development

```bash
npm install
npx vercel dev
# Open http://localhost:3000
```

## Tech

- **Frontend** — Vanilla HTML/CSS/JS, zero dependencies
- **Backend** — Vercel Serverless Function with [Sharp](https://sharp.pixelplumbing.com/)
- **Sharp** supports: JPEG (mozjpeg), PNG, WebP, AVIF, GIF, TIFF, BMP input/output

## Limits

Vercel free tier limits:
- 4.5 MB request body (increase in Pro)
- 10 second function timeout (30s in vercel.json for Pro)
- 1 GB memory allocated to Sharp
