import { Room, Client } from "colyseus";
import { MatchState } from "../schema/MatchState";
import { Player } from "../schema/Player";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SPEED,
  TICK_RATE,
  MAX_PLAYERS,
  PLAYER_COLORS,
} from "../config";

/**
 * A MatchRoom is one match — one shared arena that players join with a code.
 *
 * The server is AUTHORITATIVE: clients only send their *input* (which way they
 * want to go). The server decides where everyone actually ends up. That stops
 * one client from cheating by teleporting, and keeps everyone in sync.
 *
 * The multiplayer loop, start to finish:
 *   1. A client joins        -> onJoin() adds a Player to the shared state.
 *   2. A client sends input   -> onMessage("input") stores that player's vector.
 *   3. Every tick (~20x/sec)  -> update() moves every player using their input.
 *   4. Colyseus then automatically broadcasts the changed state to all clients.
 *   5. A client leaves        -> onLeave() removes its Player from the state.
 */
export class MatchRoom extends Room<MatchState> {
  maxClients = MAX_PLAYERS;

  onCreate(options: { roomCode?: string }) {
    // Build the shared state object for this room.
    this.state = new MatchState();
    this.state.width = ARENA_WIDTH;
    this.state.height = ARENA_HEIGHT;
    this.state.roomCode = (options?.roomCode ?? "").toUpperCase();

    // Receive movement input from a client and remember it for that player.
    this.onMessage("input", (client, message: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // Clamp each component to [-1, 1] so a client can't ask to move faster
      // than everyone else by sending a giant vector (very light anti-cheat).
      player.inputX = clamp(message.x, -1, 1);
      player.inputY = clamp(message.y, -1, 1);
    });

    // Run the authoritative simulation at a fixed rate. Colyseus calls us with
    // the milliseconds elapsed since the previous tick.
    this.setSimulationInterval(
      (deltaMs) => this.update(deltaMs),
      1000 / TICK_RATE,
    );

    console.log(`Room created with code "${this.state.roomCode}".`);
  }

  /** Move every player based on the last input we received from them. */
  update(deltaMs: number) {
    // Convert to seconds so PLAYER_SPEED is in nice "units per second".
    const dt = deltaMs / 1000;

    this.state.players.forEach((player) => {
      let dx = player.inputX;
      let dy = player.inputY;

      // Normalize so moving diagonally isn't faster than moving straight.
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }

      player.x += dx * PLAYER_SPEED * dt;
      player.y += dy * PLAYER_SPEED * dt;

      // Keep players inside the arena.
      player.x = clamp(player.x, 0, this.state.width);
      player.y = clamp(player.y, 0, this.state.height);
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();

    // Spawn at a random spot so players don't all stack on top of each other.
    player.x = Math.random() * this.state.width;
    player.y = Math.random() * this.state.height;
    player.name = (options?.name || "Player").slice(0, 16);
    // Hand out colors in order, wrapping around if we run out.
    player.color = PLAYER_COLORS[(this.clients.length - 1) % PLAYER_COLORS.length];

    this.state.players.set(client.sessionId, player);
    console.log(
      `${player.name} joined (${client.sessionId}). Players: ${this.state.players.size}`,
    );
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(
      `${client.sessionId} left. Players: ${this.state.players.size}`,
    );
  }
}

/** Keep a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
