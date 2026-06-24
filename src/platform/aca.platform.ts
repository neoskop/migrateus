import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import portfinder from 'portfinder';
import { LoggerService } from '../logger/logger.service.js';
import { AcaService } from '../aca/aca.service.js';
import { AcaContainerService } from '../container/aca-container/aca-container.service.js';
import { Platform } from './platform.js';

/**
 * Headers that are connection-specific and must NOT be forwarded by a proxy
 * (RFC 7230 §6.1). Forwarding `transfer-encoding`/`connection` verbatim makes
 * the downstream client (undici) mis-frame the response and hang.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Gateway statuses that mean the ingress could not reach the backend (safe to retry). */
const RETRIABLE_STATUS = new Set([502, 503, 504]);
const MAX_PROXY_ATTEMPTS = 6;
const UPSTREAM_TIMEOUT_MS = 60_000;

function filterHeaders(
  headers: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      out[key] = value;
    }
  }
  return out;
}

export class AcaPlatform extends Platform {
  public readonly containerService: AcaContainerService;
  private proxyServer?: http.Server;
  private proxyAgent?: https.Agent;

  constructor(
    private readonly logger: LoggerService,
    private readonly acaService: AcaService,
  ) {
    super();
    this.containerService = new AcaContainerService(logger, acaService);
  }

  setup(): Promise<void> {
    return this.acaService.setup();
  }

  /**
   * ACA has no `kubectl port-forward` equivalent, but the Directus app is
   * published through external HTTPS ingress. Every consumer (login, the SDK
   * client, asset up/download) assumes Directus is reachable as
   * `http://localhost:<port>`, so a small local HTTP→HTTPS reverse proxy bridges
   * that to the ingress FQDN.
   *
   * The proxy is hardened for a long, chatty restore over WAN:
   *  - a keep-alive agent reuses upstream connections;
   *  - hop-by-hop headers are stripped both ways (else undici mis-frames replies);
   *  - the request body is buffered so a transient backend blip can be retried;
   *  - gateway errors (502/503/504, e.g. Directus reloading after a schema
   *    apply) are retried with backoff rather than failing the restore;
   *  - the response is ALWAYS ended, and the listening socket is `unref`'d so a
   *    leftover proxy can never keep the process alive.
   */
  async forwardDirectus(): Promise<number> {
    const baseUrl = await this.acaService.getDirectusBaseUrl();
    const target = new URL(baseUrl);
    const localPort = await portfinder.getPortPromise();

    this.proxyAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });

    this.proxyServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('error', () => res.destroy());
      req.on('end', () => {
        this.proxyAttempt(target, req, res, Buffer.concat(chunks), 1);
      });
    });

    await new Promise<void>((resolve) =>
      this.proxyServer!.listen(localPort, '127.0.0.1', resolve),
    );
    // Don't let the listening socket keep the process alive on its own; active
    // requests keep the loop busy while the restore runs, and teardown() closes
    // it explicitly afterwards.
    this.proxyServer.unref();

    this.logger.debug(
      `Proxying http://127.0.0.1:${localPort} → ${baseUrl} (ACA ingress)`,
    );
    await this.waitForDirectus(localPort);
    return localPort;
  }

  /** One upstream attempt for a buffered request, retrying transient gateway errors. */
  private proxyAttempt(
    target: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Buffer,
    attempt: number,
  ): void {
    const retry = (reason: string): boolean => {
      if (attempt >= MAX_PROXY_ATTEMPTS || res.headersSent || res.destroyed) {
        return false;
      }
      const delayMs = Math.min(500 * 2 ** (attempt - 1), 8_000);
      this.logger.debug(
        `ACA proxy: ${req.method} ${req.url} ${reason}; retry ${attempt + 1}/${MAX_PROXY_ATTEMPTS} in ${delayMs}ms`,
      );
      setTimeout(
        () => this.proxyAttempt(target, req, res, body, attempt + 1),
        delayMs,
      ).unref();
      return true;
    };

    let completed = false;
    const upstream = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        method: req.method,
        path: req.url,
        agent: this.proxyAgent,
        headers: {
          ...filterHeaders(req.headers),
          // ACA ingress routes by Host/SNI — present the app FQDN, not localhost.
          host: target.host,
          'content-length': body.length,
        },
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode ?? 502;
        if (RETRIABLE_STATUS.has(status) && retry(`gateway ${status}`)) {
          upstreamRes.resume(); // drain so the keep-alive socket is reusable
          return;
        }
        upstreamRes.on('end', () => {
          completed = true;
        });
        res.writeHead(status, filterHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
    );

    upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () =>
      upstream.destroy(new Error('upstream timeout')),
    );
    upstream.on('error', (err) => {
      if (retry(`error ${err.message}`)) {
        return;
      }
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end(
        `migrateus ACA ingress proxy error after ${attempt} attempt(s): ${err.message}`,
      );
    });
    // If the client aborts before the upstream response finishes, kill the
    // upstream. Once completed, leave the socket alone so the keep-alive agent
    // can reuse it (destroying it here would defeat connection reuse).
    res.on('close', () => {
      if (!completed) {
        upstream.destroy();
      }
    });

    upstream.end(body);
  }

  async teardown(): Promise<void> {
    this.proxyServer?.close();
    this.proxyServer = undefined;
    this.proxyAgent?.destroy();
    this.proxyAgent = undefined;
  }

  restartDirectus(): Promise<void> {
    return this.acaService.restartDirectus();
  }

  /** Polls the proxied port until Directus answers, or fails with guidance. */
  private async waitForDirectus(port: number): Promise<void> {
    const deadline = Date.now() + 30_000;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/server/ping`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (e: any) {
        lastError = e?.message ?? String(e);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(
      `Directus is unreachable through the ACA ingress proxy at ` +
        `http://127.0.0.1:${port} after 30s. Last error: ${lastError}`,
    );
  }
}
