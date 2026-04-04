import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '20mb',
  },
};

// Parse raw multipart body manually (no external dep needed for this)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;

    const headerStart = boundaryIdx + boundaryBuf.length + 2; // skip \r\n
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headerStr = buffer.slice(headerStart, headerEnd).toString();
    const bodyStart = headerEnd + 4;

    const nextBoundary = buffer.indexOf(boundaryBuf, bodyStart);
    const bodyEnd = nextBoundary !== -1 ? nextBoundary - 2 : buffer.length;

    parts.push({ headers: headerStr, data: buffer.slice(bodyStart, bodyEnd) });
    start = nextBoundary !== -1 ? nextBoundary : buffer.length;
  }

  return parts;
}

function getHeader(headers, name) {
  const lines = headers.split('\r\n');
  for (const line of lines) {
    if (line.toLowerCase().startsWith(name.toLowerCase() + ':')) {
      return line.slice(name.length + 1).trim();
    }
  }
  return null;
}

function getDispositionParam(disp, param) {
  const match = disp && disp.match(new RegExp(`${param}="([^"]+)"`));
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'Missing multipart boundary' });

    const boundary = boundaryMatch[1].trim();
    const rawBody  = await getRawBody(req);
    const parts    = parseMultipart(rawBody, boundary);

    // Extract fields and file
    const fields = {};
    let fileBuffer = null;
    let fileMime   = 'image/jpeg';

    for (const part of parts) {
      const disp = getHeader(part.headers, 'Content-Disposition');
      const name = getDispositionParam(disp, 'name');
      const filename = getDispositionParam(disp, 'filename');

      if (filename) {
        fileBuffer = part.data;
        fileMime   = getHeader(part.headers, 'Content-Type') || 'image/jpeg';
      } else if (name) {
        fields[name] = part.data.toString().trim();
      }
    }

    if (!fileBuffer) return res.status(400).json({ error: 'No image file uploaded' });

    // Parse resize params
    const mode    = fields.mode    || 'dimensions';   // dimensions | percentage | preset
    const format  = fields.format  || 'original';
    const quality = parseInt(fields.quality || '85', 10);
    const fit     = fields.fit     || 'inside';       // inside | cover | fill | contain

    let targetW = null;
    let targetH = null;

    if (mode === 'dimensions') {
      targetW = fields.width  ? parseInt(fields.width,  10) : null;
      targetH = fields.height ? parseInt(fields.height, 10) : null;
    } else if (mode === 'percentage') {
      const pct = parseFloat(fields.percentage || '50') / 100;
      const meta = await sharp(fileBuffer).metadata();
      targetW = Math.round((meta.width  || 800) * pct);
      targetH = Math.round((meta.height || 600) * pct);
    } else if (mode === 'preset') {
      const presets = {
        'twitter-header':  { w: 1500, h: 500  },
        'twitter-post':    { w: 1200, h: 675  },
        'instagram-sq':    { w: 1080, h: 1080 },
        'instagram-port':  { w: 1080, h: 1350 },
        'instagram-land':  { w: 1080, h: 566  },
        'facebook-cover':  { w: 820,  h: 312  },
        'facebook-post':   { w: 1200, h: 630  },
        'linkedin-cover':  { w: 1584, h: 396  },
        'linkedin-post':   { w: 1200, h: 627  },
        'og-image':        { w: 1200, h: 630  },
        'favicon':         { w: 32,   h: 32   },
        'thumbnail':       { w: 300,  h: 300  },
        'hd':              { w: 1280, h: 720  },
        'fhd':             { w: 1920, h: 1080 },
        '4k':              { w: 3840, h: 2160 },
      };
      const p = presets[fields.preset] || { w: 800, h: 600 };
      targetW = p.w;
      targetH = p.h;
    }

    // Build Sharp pipeline
    let pipeline = sharp(fileBuffer);

    if (targetW || targetH) {
      pipeline = pipeline.resize(targetW || null, targetH || null, {
        fit: fit,
        withoutEnlargement: fields.noEnlarge === 'true',
      });
    }

    // Output format
    let outMime = fileMime;
    if (format === 'jpeg' || format === 'jpg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      outMime  = 'image/jpeg';
    } else if (format === 'png') {
      pipeline = pipeline.png({ compressionLevel: Math.round((100 - quality) / 11) });
      outMime  = 'image/png';
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
      outMime  = 'image/webp';
    } else if (format === 'avif') {
      pipeline = pipeline.avif({ quality });
      outMime  = 'image/avif';
    } else {
      // Keep original format
      if (fileMime === 'image/jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      else if (fileMime === 'image/png') pipeline = pipeline.png();
      else if (fileMime === 'image/webp') pipeline = pipeline.webp({ quality });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    res.setHeader('Content-Type', outMime);
    res.setHeader('X-Original-Size',  fileBuffer.length.toString());
    res.setHeader('X-Output-Size',    data.length.toString());
    res.setHeader('X-Output-Width',   info.width.toString());
    res.setHeader('X-Output-Height',  info.height.toString());
    res.setHeader('X-Output-Format',  info.format);
    res.status(200).send(data);

  } catch (err) {
    console.error('Resize error:', err);
    res.status(500).json({ error: err.message || 'Resize failed' });
  }
}
