import http, { type Server } from "node:http";
import type { NetworkSettings } from "../../../src/types/operations";
import type { PrinterEvent, PrinterStatus } from "../../../src/types/printer";

interface PublicStatus { connected: boolean; status: PrinterStatus; fileName: string | null; percent: number; currentLayer: number; totalLayers: number; hotend: number; bed: number; updatedAt: number }

export class LocalMonitoringServer {
  private server: Server | null = null;
  private port: number | null = null;
  private status: PublicStatus = { connected: false, status: "disconnected", fileName: null, percent: 0, currentLayer: 0, totalLayers: 0, hotend: 0, bed: 0, updatedAt: Date.now() };

  update(event: PrinterEvent): void {
    this.status.updatedAt = Date.now();
    if (event.type === "CONNECTED") { this.status.connected = true; this.status.status = "idle"; }
    else if (event.type === "DISCONNECTED") { this.status.connected = false; this.status.status = "disconnected"; }
    else if (event.type === "STATUS") this.status.status = event.status;
    else if (event.type === "PRINT_STARTED") { this.status.fileName = event.fileName; this.status.percent = 0; this.status.totalLayers = event.totalLayers; }
    else if (event.type === "PROGRESS") { this.status.fileName = event.progress.fileName; this.status.percent = event.progress.percent; this.status.currentLayer = event.progress.currentLayer; this.status.totalLayers = event.progress.totalLayers; }
    else if (event.type === "TEMPERATURE") { this.status.hotend = event.hotend ?? this.status.hotend; this.status.bed = event.bed ?? this.status.bed; }
  }

  configure(settings: NetworkSettings): void {
    if (!settings.enabled) { this.stop(); return; }
    if (this.server && this.port === settings.port) return;
    this.stop();
    this.server = http.createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (request.method === "GET" && request.url === "/api/status") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(this.status));
        return;
      }
      if (request.method === "GET" && (request.url === "/" || request.url === "/index.html")) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
        response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>PrintDeck</title><style>body{font:16px system-ui;background:#0b0e14;color:#d1d5db;max-width:560px;margin:10vh auto;padding:24px}main{border:1px solid #374151;padding:24px}b{color:#fff}progress{width:100%}</style><main><h1>PrintDeck</h1><p id="state">Loading...</p><progress id="progress" max="100"></progress><p id="detail"></p></main><script>setInterval(load,2000);load();async function load(){const s=await fetch('/api/status').then(r=>r.json());state.textContent=s.status.toUpperCase()+(s.fileName?' - '+s.fileName:'');progress.value=s.percent;detail.textContent=s.percent.toFixed(1)+'% | Layer '+s.currentLayer+'/'+s.totalLayers+' | Hotend '+s.hotend.toFixed(1)+' C | Bed '+s.bed.toFixed(1)+' C'}</script>`);
        return;
      }
      response.writeHead(404).end();
    });
    this.server.on("error", (error) => console.error("Local monitoring server failed.", error));
    this.server.listen(settings.port, "0.0.0.0");
    this.port = settings.port;
  }

  stop(): void { this.server?.close(); this.server = null; this.port = null; }
}
