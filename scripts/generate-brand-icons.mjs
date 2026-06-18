import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="CRM24">
  <defs>
    <linearGradient id="bg" x1="122" y1="80" x2="910" y2="952" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75F0DF"/>
      <stop offset="0.42" stop-color="#19C8D9"/>
      <stop offset="1" stop-color="#1376D8"/>
    </linearGradient>
    <radialGradient id="topGlow" cx="27%" cy="18%" r="65%">
      <stop stop-color="#ECFFFB" stop-opacity="0.92"/>
      <stop offset="0.42" stop-color="#7FF6E7" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#06A7C7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bottomGlow" cx="83%" cy="83%" r="52%">
      <stop stop-color="#0A3F9B" stop-opacity="0.72"/>
      <stop offset="0.54" stop-color="#117BD9" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#0DBBD0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="199" y1="258" x2="821" y2="776" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.86"/>
      <stop offset="0.55" stop-color="#F4FFFF" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#D9F9FF" stop-opacity="0.42"/>
    </linearGradient>
    <linearGradient id="glassStroke" x1="215" y1="260" x2="812" y2="771" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#BFFAFF" stop-opacity="0.5"/>
    </linearGradient>
    <linearGradient id="word" x1="254" y1="451" x2="768" y2="622" gradientUnits="userSpaceOnUse">
      <stop stop-color="#061B30"/>
      <stop offset="0.5" stop-color="#073758"/>
      <stop offset="1" stop-color="#06213B"/>
    </linearGradient>
    <linearGradient id="tag" x1="658" y1="609" x2="816" y2="731" gradientUnits="userSpaceOnUse">
      <stop stop-color="#061C35"/>
      <stop offset="1" stop-color="#0B3B69"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-24%" width="140%" height="150%">
      <feDropShadow dx="0" dy="34" stdDeviation="34" flood-color="#05345F" flood-opacity="0.26"/>
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#06172D" flood-opacity="0.14"/>
    </filter>
    <filter id="tinyShadow" x="-20%" y="-24%" width="140%" height="150%">
      <feDropShadow dx="0" dy="11" stdDeviation="12" flood-color="#02253A" flood-opacity="0.18"/>
    </filter>
    <clipPath id="roundClip">
      <rect width="1024" height="1024" rx="228"/>
    </clipPath>
  </defs>

  <g clip-path="url(#roundClip)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <rect width="1024" height="1024" fill="url(#topGlow)"/>
    <rect width="1024" height="1024" fill="url(#bottomGlow)"/>

    <g opacity="0.2">
      <path d="M-78 765C95 686 250 666 430 706c158 35 301 22 466-63 86-44 153-65 229-66" fill="none" stroke="#F4FFFF" stroke-width="24" stroke-linecap="round"/>
      <path d="M-34 230C140 159 291 159 456 219c143 52 289 51 445-11" fill="none" stroke="#E8FFFE" stroke-width="15" stroke-linecap="round"/>
    </g>

    <g opacity="0.18" filter="url(#tinyShadow)">
      <rect x="122" y="679" width="178" height="116" rx="30" fill="#FFFFFF"/>
      <rect x="725" y="171" width="178" height="116" rx="30" fill="#FFFFFF"/>
      <path d="M771 238l31-29 24 19 33-42" fill="none" stroke="#063551" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="170" cy="727" r="18" fill="#0B3B69"/>
      <circle cx="223" cy="727" r="18" fill="#0B3B69"/>
      <circle cx="250" cy="756" r="18" fill="#0B3B69"/>
    </g>

    <g filter="url(#softShadow)">
      <rect x="167" y="299" width="690" height="426" rx="118" fill="url(#glass)"/>
      <rect x="181" y="313" width="662" height="398" rx="104" fill="none" stroke="url(#glassStroke)" stroke-width="5"/>
      <path d="M243 640h317" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" opacity="0.54"/>
      <path d="M248 389h116" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" opacity="0.52"/>
      <path d="M724 385h54" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" opacity="0.46"/>

      <text x="512" y="565"
        text-anchor="middle"
        fill="url(#word)"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-size="184"
        font-style="italic"
        font-weight="900"
        letter-spacing="-17">CRM</text>

      <g transform="translate(650 596)">
        <rect x="0" y="0" width="166" height="98" rx="38" fill="url(#tag)" opacity="0.96"/>
        <rect x="8" y="8" width="150" height="82" rx="31" fill="none" stroke="#5FF2E4" stroke-width="4" opacity="0.72"/>
        <text x="83" y="68"
          text-anchor="middle"
          fill="#FFFFFF"
          font-family="Arial Black, Arial, Helvetica, sans-serif"
          font-size="70"
          font-style="italic"
          font-weight="900"
          letter-spacing="-7">24</text>
      </g>
    </g>

    <rect x="29" y="29" width="966" height="966" rx="210" fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.34"/>
  </g>
</svg>
`;

const foregroundSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" aria-label="CRM24 foreground">
  <defs>
    <linearGradient id="glass" x1="199" y1="258" x2="821" y2="776" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="#F4FFFF" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#D9F9FF" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="glassStroke" x1="215" y1="260" x2="812" y2="771" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#BFFAFF" stop-opacity="0.58"/>
    </linearGradient>
    <linearGradient id="word" x1="254" y1="451" x2="768" y2="622" gradientUnits="userSpaceOnUse">
      <stop stop-color="#061B30"/>
      <stop offset="0.5" stop-color="#073758"/>
      <stop offset="1" stop-color="#06213B"/>
    </linearGradient>
    <linearGradient id="tag" x1="658" y1="609" x2="816" y2="731" gradientUnits="userSpaceOnUse">
      <stop stop-color="#061C35"/>
      <stop offset="1" stop-color="#0B3B69"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-24%" width="140%" height="150%">
      <feDropShadow dx="0" dy="34" stdDeviation="34" flood-color="#05345F" flood-opacity="0.27"/>
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#06172D" flood-opacity="0.16"/>
    </filter>
  </defs>
  <g filter="url(#softShadow)">
    <rect x="167" y="299" width="690" height="426" rx="118" fill="url(#glass)"/>
    <rect x="181" y="313" width="662" height="398" rx="104" fill="none" stroke="url(#glassStroke)" stroke-width="5"/>
    <path d="M243 640h317" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" opacity="0.54"/>
    <path d="M248 389h116" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" opacity="0.52"/>
    <text x="512" y="565" text-anchor="middle" fill="url(#word)" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="184" font-style="italic" font-weight="900" letter-spacing="-17">CRM</text>
    <g transform="translate(650 596)">
      <rect x="0" y="0" width="166" height="98" rx="38" fill="url(#tag)" opacity="0.96"/>
      <rect x="8" y="8" width="150" height="82" rx="31" fill="none" stroke="#5FF2E4" stroke-width="4" opacity="0.72"/>
      <text x="83" y="68" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="70" font-style="italic" font-weight="900" letter-spacing="-7">24</text>
    </g>
  </g>
</svg>
`;

const androidBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="8"
                android:startY="4"
                android:endX="104"
                android:endY="108">
                <item android:offset="0" android:color="#75F0DF"/>
                <item android:offset="0.42" android:color="#19C8D9"/>
                <item android:offset="1" android:color="#1376D8"/>
            </gradient>
        </aapt:attr>
    </path>
    <path
        android:fillColor="#38FFFFFF"
        android:pathData="M-6,82C13,75 31,73 49,78C67,82 83,80 104,70L116,65L116,108L-6,108z" />
    <path
        android:fillColor="#2AFFFFFF"
        android:pathData="M-4,23C14,16 31,16 49,22C67,28 83,27 103,20L113,16L113,0L-4,0z" />
</vector>
`;

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

function icoFromPngs(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]);
}

async function pngFromSvg(svg, size, options = {}) {
  const density = options.density ?? 384;
  return sharp(Buffer.from(svg), { density })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writePng(file, svg, size, options = {}) {
  const buffer = await pngFromSvg(svg, size, options);
  await fs.writeFile(file, buffer);
  return buffer;
}

async function main() {
  await fs.writeFile(path.join(publicDir, 'brand-icon.svg'), iconSvg);

  await writePng(path.join(publicDir, 'favicon.png'), iconSvg, 512);
  await writePng(path.join(publicDir, 'icon-512.png'), iconSvg, 512);
  await writePng(path.join(publicDir, 'icon-192.png'), iconSvg, 192);
  await writePng(path.join(publicDir, 'apple-touch-icon.png'), iconSvg, 180);
  await writePng(path.join(publicDir, 'favicon-96x96.png'), iconSvg, 96);

  const icoImages = [];
  for (const size of [16, 32, 48, 64]) {
    icoImages.push({ size, buffer: await pngFromSvg(iconSvg, size, { density: 768 }) });
  }
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), icoFromPngs(icoImages));

  const legacySizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };
  for (const [dir, size] of Object.entries(legacySizes)) {
    const icon = await pngFromSvg(iconSvg, size);
    await fs.writeFile(path.join(androidRes, dir, 'ic_launcher.png'), icon);
    await fs.writeFile(path.join(androidRes, dir, 'ic_launcher_round.png'), icon);
  }

  const foregroundSizes = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
  };
  for (const [dir, size] of Object.entries(foregroundSizes)) {
    await writePng(path.join(androidRes, dir, 'ic_launcher_foreground.png'), foregroundSvg, size);
  }

  await fs.writeFile(path.join(androidRes, 'drawable', 'ic_launcher_background.xml'), androidBackgroundXml);
  await fs.writeFile(path.join(androidRes, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveIconXml);
  await fs.writeFile(path.join(androidRes, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptiveIconXml);
  await fs.writeFile(
    path.join(androidRes, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#19C8D9</color>\n</resources>\n`,
  );
}

await main();
