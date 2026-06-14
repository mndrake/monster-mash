import { Client, Room, getStateCallbacks } from "colyseus.js";
import { SERVER_URL, ROOM_NAME } from "../config";

/**
 * ============================================================================
 *  THE TRANSPORT BOUNDARY
 * ============================================================================
 * This file is the ONLY place in the client that knows we're using Colyseus.
 * The game code (Phaser scenes) talks to this class through a small, plain
 * interface: "join", "send my input", "tell me when players change".
 *
 * If we later swap the backend (e.g. to Cloudflare Durable Objects), only this
 * file needs to change — the game code keeps working unchanged.
 * ============================================================================
 */

/** A plain snapshot of one player. The game renders from these — no Colyseus types leak out. */
export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

/** Callbacks the game provides so it can react to what the server tells us. */
export interface NetEvents {
  /** Fires once, when we've joined and received the arena size. */
  onJoin: (arenaWidth: number, arenaHeight: number) => void;
  /** A player appeared (could be us or someone else). */
  onPlayerAdd: (player: PlayerSnapshot) => void;
  /** A player's position (or other field) changed on the server. */
  onPlayerChange: (player: PlayerSnapshot) => void;
  /** A player left. */
  onPlayerRemove: (id: string) => void;
}

export class Network {
  private client: Client;
  private room?: Room;

  /** Our own player id, so the game knows which player is "me". */
  selfId = "";

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  /** True once we're connected to a room. */
  get connected(): boolean {
    return this.room !== undefined;
  }

  /** How many players are currently in our room. */
  get playerCount(): number {
    return this.room?.state.players.size ?? 0;
  }

  /**
   * Join (or create) the room with the given code, then wire up the server's
   * state changes to the game's callbacks.
   */
  async join(roomCode: string, name: string, events: NetEvents): Promise<void> {
    // joinOrCreate + the server's filterBy(["roomCode"]) means: join the room
    // with this code if it exists, otherwise create it.
    this.room = await this.client.joinOrCreate(ROOM_NAME, { roomCode, name });
    this.selfId = this.room.sessionId;

    // getStateCallbacks is the Colyseus 0.16 way to listen for state changes.
    const $ = getStateCallbacks(this.room);

    // Deliver the arena size to the game as soon as the first state arrives.
    this.room.onStateChange.once((state) => {
      events.onJoin(state.width, state.height);
    });

    // When a player is added to the shared map...
    $(this.room.state).players.onAdd((player, id) => {
      events.onPlayerAdd(snapshot(id, player));
      // ...and whenever that player's fields change (every tick they move),
      // tell the game so it can update where the sprite is heading.
      $(player).onChange(() => {
        events.onPlayerChange(snapshot(id, player));
      });
    });

    // When a player is removed from the map, tell the game to delete the sprite.
    $(this.room.state).players.onRemove((_player, id) => {
      events.onPlayerRemove(id);
    });
  }

  /** Send our movement input to the server. The server decides what it does. */
  sendInput(x: number, y: number): void {
    this.room?.send("input", { x, y });
  }

  /** Leave the room and clean up (e.g. when returning to the lobby). */
  leave(): void {
    this.room?.leave();
    this.room = undefined;
  }
}

/** Turn a Colyseus player schema into a plain snapshot the game understands. */
function snapshot(id: string, player: {
  x: number;
  y: number;
  name: string;
  color: string;
}): PlayerSnapshot {
  return { id, x: player.x, y: player.y, name: player.name, color: player.color };
}
