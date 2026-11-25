export const DEFAULT_UI_PORT = 4300;
/** Loopback only: the UI starts apps and browsers, so it is never on the network. */
export const UI_HOST = '127.0.0.1';

export const MAX_LOG_ENTRIES = 2_000;
export const MAX_REPORTS_LISTED = 50;
export const MAX_REQUEST_BODY_BYTES = 4_096;
export const SSE_HEARTBEAT_MS = 15_000;

export const PROJECT_NAME_PATTERN = /^[a-z0-9-]+$/;
/** Report folders are named after the run's start time, e.g. 2026-11-25T06-41-39-696Z. */
export const REPORT_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
export const SCREENSHOT_PATTERN = /^[a-z0-9-]+-step-\d+\.png$/;

/** The only static files served, mapped to files in web/. No other path is readable. */
export const WEB_FILES: Readonly<Record<string, {file: string; type: string}>> =
  {
    '/': {file: 'index.html', type: 'text/html; charset=utf-8'},
    '/app.js': {file: 'app.js', type: 'text/javascript; charset=utf-8'},
    '/styles.css': {file: 'styles.css', type: 'text/css; charset=utf-8'},
    '/logo.svg': {file: 'logo.svg', type: 'image/svg+xml'},
  };

/** Pixel fonts, self-hosted from node_modules so the UI works offline. */
export const FONT_FILES: Readonly<Record<string, string>> = {
  'press-start-2p.woff2':
    '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
  'pixelify-sans-400.woff2':
    '@fontsource/pixelify-sans/files/pixelify-sans-latin-400-normal.woff2',
  'pixelify-sans-700.woff2':
    '@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2',
  'vt323.woff2': '@fontsource/vt323/files/vt323-latin-400-normal.woff2',
};

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
