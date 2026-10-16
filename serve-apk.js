const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8082;
const RELEASE_APK = path.join(
  __dirname,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
);
const DEBUG_APK = path.join(
  __dirname,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

const PRIVACY_HTML = path.join(__dirname, 'privacy-policy.html');

function getApkPath() {
  if (fs.existsSync(RELEASE_APK)) return RELEASE_APK;
  if (fs.existsSync(DEBUG_APK)) return DEBUG_APK;
  return null;
}

const server = http.createServer((req, res) => {
  if (req.url === '/privacy' || req.url === '/privacy-policy') {
    if (fs.existsSync(PRIVACY_HTML)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(PRIVACY_HTML).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Privacy policy file not found.');
      return;
    }
  }

  const currentApk = getApkPath();
  if (req.url === '/smartcalc-ai.apk' || req.url === '/download') {
    if (!currentApk) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('APK build is still in progress or not found. Please wait a moment.');
      return;
    }
    const stat = fs.statSync(currentApk);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="smartcalc-ai.apk"',
    });
    fs.createReadStream(currentApk).pipe(res);
    return;
  }

  // Beautiful mobile-friendly download landing page
  const apkReady = Boolean(currentApk);
  const sizeMb = apkReady
    ? (fs.statSync(currentApk).size / (1024 * 1024)).toFixed(1)
    : '0';
  const isRelease = currentApk === RELEASE_APK;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartCalc AI — Download APK</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0A0D14; color: #F1F5F9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #131826; border: 1px solid #232B42; border-radius: 24px; padding: 32px 24px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .logo { width: 72px; height: 72px; background: #4F46E5; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 34px; margin-bottom: 16px; box-shadow: 0 10px 24px rgba(79,70,229,0.4); }
    h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
    p.subtitle { color: #94A3B8; font-size: 14px; margin-bottom: 24px; }
    .btn { display: block; width: 100%; background: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 16px; border-radius: 16px; font-size: 16px; font-weight: 700; transition: all 0.2s; box-shadow: 0 8px 20px rgba(79,70,229,0.35); }
    .btn:hover { background: #4338CA; }
    .info { margin-top: 24px; background: #1A2033; border-radius: 14px; padding: 14px; font-size: 13px; color: #94A3B8; text-align: left; line-height: 1.5; }
    .info strong { color: #F1F5F9; }
    .badge { display: inline-block; background: rgba(16,185,129,0.15); color: #10B981; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 20px; margin-bottom: 14px; }
    .footer-link { margin-top: 20px; font-size: 13px; }
    .footer-link a { color: #94A3B8; text-decoration: none; transition: color 0.2s; }
    .footer-link a:hover { color: #E6D01B; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎙️</div>
    <span class="badge">PRODUCTION READY • STANDALONE APK</span>
    <h1>SmartCalc AI</h1>
    <p class="subtitle">AI-Powered Voice Calculator for Android</p>
    
    ${
      apkReady
        ? `<a href="/smartcalc-ai.apk" class="btn">⬇ Download APK (${sizeMb} MB)</a>`
        : `<p style="color: #F59E0B; font-weight: 600;">Building APK... Please refresh in 15 seconds.</p>`
    }

    <div class="info">
      <strong>Installation Steps:</strong><br>
      1. Tap the Download button above.<br>
      2. When downloaded, tap <strong>Open</strong> &rarr; <strong>Install</strong>.<br>
      3. (If prompted, allow "Install from this source").<br>
      4. Open SmartCalc AI and enjoy voice calculations!
    </div>

    <div class="footer-link">
      <a href="/privacy">🔒 View Privacy Policy (100% On-Device)</a>
    </div>
  </div>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`APK & Privacy Server running at http://0.0.0.0:${PORT}`);
  console.log(`Download URL: http://0.0.0.0:${PORT}/`);
  console.log(`Privacy Policy URL: http://0.0.0.0:${PORT}/privacy`);
});
