import http from "http";
import os from "os";
import { Server } from "colyseus";
import { MatchRoom } from "./rooms/MatchRoom";
import { PORT } from "./config";

/**
 * Boots the Colyseus game server.
 *
 * We register one room type called "match". Each running instance of that room
 * is one arena. `.filterBy(["roomCode"])` is what makes ROOM CODES work:
 * when a client asks to join "match" with a given roomCode, Colyseus only puts
 * them into a room created with the *same* code (and makes a new one if none
 * exists yet). Same code => same arena; different code => different arena.
 */

// We hand Colyseus our own HTTP server so we can answer a simple health check
// at "/" and "/health". Colyseus doesn't serve a page at "/" (it waits for a
// WebSocket upgrade), so opening the server URL in a browser would otherwise
// just spin forever — which makes it look unreachable even when it's fine.
// Everything we DON'T handle here falls through to Colyseus's matchmaking.
const httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      `Monster Mash game server is running ✅\n` +
        `Port ${PORT} is reachable from this device.\n` +
        `(The game itself is served separately on port 5173.)`,
    );
  }
  // Any other path: do nothing and let Colyseus handle it (e.g. /matchmake/*).
});

const gameServer = new Server({ server: httpServer });

gameServer.define("match", MatchRoom).filterBy(["roomCode"]);

// Bind to 0.0.0.0 so phones/tablets on the same wifi can reach it (not just
// this computer). It's the default, but being explicit makes that intent clear.
gameServer.listen(PORT, "0.0.0.0").then(() => {
  console.log(`🕹  Monster Mash server listening on port ${PORT}`);
  for (const url of lanUrls(PORT)) console.log(`   reachable at  ${url}`);
  console.log(`   health check: open any of those in a browser to confirm it's reachable.`);
});

/** Best-effort list of this machine's LAN addresses, for a friendly log. */
function lanUrls(port: number): string[] {
  const urls: string[] = [`http://localhost:${port}/health`];
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        urls.push(`http://${net.address}:${port}/health`);
      }
    }
  }
  return urls;
}
