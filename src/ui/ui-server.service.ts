import {readFile} from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {z} from 'zod';
import type {
  ProjectListItem,
  RunEvent,
  UiServerDeps,
} from './interfaces/ui.interface.js';
import {HttpError} from './http.error.js';
import {ReportNotFoundError} from './report-not-found.error.js';
import {
  FONT_FILES,
  MAX_REPORTS_LISTED,
  MAX_REQUEST_BODY_BYTES,
  SECURITY_HEADERS,
  SSE_HEARTBEAT_MS,
  UI_HOST,
  WEB_FILES,
} from './ui.constants.js';

const startRunSchema = z.strictObject({
  project: z.string().regex(/^[a-z0-9-]+$/),
  headed: z.boolean().default(false),
  skipAi: z.boolean().default(false),
});

const REPORT_ROUTE = /^\/api\/reports\/([^/]+)\/([^/]+)$/;
const SCREENSHOT_ROUTE =
  /^\/api\/reports\/([^/]+)\/([^/]+)\/screenshots\/([^/]+)$/;
const FONT_ROUTE = /^\/fonts\/([^/]+)$/;

/**
 * Local web UI server. It listens on 127.0.0.1 only and defends against
 * other websites in the same browser: the Host header must be ours (stops
 * DNS rebinding) and POSTs must be same-origin JSON (stops cross-site
 * requests from starting runs).
 */
export class UiServerService {
  private server: Server | undefined;
  private allowedHosts = new Set<string>();

  constructor(private readonly deps: UiServerDeps) {}

  /** Returns the port actually used (pass 0 for any free port). */
  async listen(port: number): Promise<number> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch(error => this.fail(res, error));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, UI_HOST, () => resolve());
    });
    this.server = server;
    const actualPort = (server.address() as AddressInfo).port;
    this.allowedHosts = new Set([
      `${UI_HOST}:${actualPort}`,
      `localhost:${actualPort}`,
    ]);
    return actualPort;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = undefined;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    const host = req.headers.host ?? '';
    if (!this.allowedHosts.has(host)) {
      throw new HttpError(403, 'Unknown host');
    }
    const method = req.method ?? 'GET';
    const path = new URL(req.url ?? '/', `http://${host}`).pathname;

    if (method === 'POST') {
      this.assertSameOriginJson(req);
      if (path === '/api/runs') {
        return this.startRun(req, res);
      }
      throw new HttpError(404, 'Not found');
    }
    if (method !== 'GET') {
      throw new HttpError(405, 'Method not allowed');
    }
    return this.routeGet(path, req, res);
  }

  private async routeGet(
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const web = WEB_FILES[path];
    if (web) {
      return this.sendFile(
        res,
        join(this.deps.rootDir, 'web', web.file),
        web.type,
      );
    }
    const font = FONT_ROUTE.exec(path)?.[1];
    if (font !== undefined) {
      const file = FONT_FILES[font];
      if (!file) {
        throw new HttpError(404, 'Not found');
      }
      return this.sendFile(
        res,
        join(this.deps.rootDir, 'node_modules', file),
        'font/woff2',
        'public, max-age=86400',
      );
    }
    switch (path) {
      case '/api/projects':
        return this.sendJson(res, 200, await this.listProjects());
      case '/api/doctor':
        return this.sendJson(res, 200, await this.deps.doctor());
      case '/api/runs/current':
        return this.sendJson(res, 200, this.deps.runs.snapshot());
      case '/api/runs/events':
        return this.streamRunEvents(req, res);
      case '/api/reports':
        return this.sendJson(
          res,
          200,
          await this.deps.reports.list(MAX_REPORTS_LISTED),
        );
    }
    const screenshot = SCREENSHOT_ROUTE.exec(path);
    if (screenshot) {
      const [, project = '', id = '', file = ''] = screenshot;
      const filePath = this.deps.reports.screenshotPath(project, id, file);
      if (!filePath) {
        throw new HttpError(404, 'Not found');
      }
      return this.sendFile(res, filePath, 'image/png');
    }
    const report = REPORT_ROUTE.exec(path);
    if (report) {
      const [, project = '', id = ''] = report;
      return this.sendJson(res, 200, await this.deps.reports.read(project, id));
    }
    throw new HttpError(404, 'Not found');
  }

  private async startRun(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const parsed = startRunSchema.safeParse(await this.readJson(req));
    if (!parsed.success) {
      throw new HttpError(400, z.prettifyError(parsed.error));
    }
    const {project, headed, skipAi} = parsed.data;
    if (!(await this.deps.projects.list()).includes(project)) {
      throw new HttpError(404, `No project "${project}"`);
    }
    const {started, state} = this.deps.runs.start(project, {headed, skipAi});
    if (!started) {
      throw new HttpError(409, `A run of "${state.project}" is still going`);
    }
    this.sendJson(res, 202, state);
  }

  private async listProjects(): Promise<ProjectListItem[]> {
    const items: ProjectListItem[] = [];
    for (const name of await this.deps.projects.list()) {
      try {
        const {config} = await this.deps.projects.load(name);
        items.push({
          name,
          baseUrl: config.baseUrl,
          environment: config.environment,
          pages: config.pages.length,
          goals: config.testGoals.length,
        });
      } catch (error) {
        items.push({
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return items;
  }

  /** Server-sent events: a snapshot first, then each state change and log line. */
  private streamRunEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('snapshot', this.deps.runs.snapshot());

    const unsubscribe = this.deps.runs.subscribe((event: RunEvent) => {
      send(event.type, event.type === 'state' ? event.state : event.entry);
    });
    const heartbeat = setInterval(
      () => res.write(': keep-alive\n\n'),
      SSE_HEARTBEAT_MS,
    );
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  private assertSameOriginJson(req: IncomingMessage): void {
    const origin = req.headers.origin ?? '';
    const originHost = URL.canParse(origin) ? new URL(origin).host : '';
    if (!this.allowedHosts.has(originHost)) {
      throw new HttpError(403, 'Cross-site request refused');
    }
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      throw new HttpError(415, 'Send JSON');
    }
  }

  private async readJson(req: IncomingMessage): Promise<unknown> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        throw new HttpError(413, 'Request too large');
      }
      chunks.push(chunk as Buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'Body is not valid JSON');
    }
  }

  private async sendFile(
    res: ServerResponse,
    path: string,
    type: string,
    cacheControl = 'no-store',
  ): Promise<void> {
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type': type, 'Cache-Control': cacheControl});
    res.end(body);
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }

  /** Expected errors get their message; anything else is logged, not exposed. */
  private fail(res: ServerResponse, error: unknown): void {
    let status = 500;
    let message = 'Something went wrong; see the terminal for details.';
    if (error instanceof HttpError) {
      ({status, message} = error);
    } else if (error instanceof ReportNotFoundError) {
      status = 404;
      message = error.message;
    } else {
      this.deps.logger.error(
        `Web UI request failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    this.sendJson(res, status, {error: message});
  }
}
