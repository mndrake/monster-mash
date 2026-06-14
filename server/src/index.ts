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
const gameServer = new Server();

gameServer.define("match", MatchRoom).filterBy(["roomCode"]);

gameServer.listen(PORT).then(() => {
  console.log(`🕹  Monster Mash server listening on ws://localhost:${PORT}`);
});
