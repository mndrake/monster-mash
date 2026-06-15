import { Client, Room, getStateCallbacks } from "colyseus.js";
import { SERVER_URL, ROOM_NAME } from "../config";

/**
 * ============================================================================
 *  THE TRANSPORT BOUNDARY
 * ============================================================================
 * This file is the ONLY place in the client that knows we're using Colyseus.
 * The game code (Phaser scenes) talks to this class through small, plain
 * snapshots and callbacks: "join", "send my input/aim/fire", "tell me when
 * players, projectiles, or cubes change".
 *
 * If we later swap the backend (e.g. to Cloudflare Durable Objects), only this
 * file needs to change — the game code keeps working unchanged.
 * ============================================================================
 */

/** A plain snapshot of one monster. The game renders from these — no Colyseus types leak out. */
export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
  monster: string;
  facing: number;
  health: number;
  maxHealth: number;
  ammo: number;
  ammoMax: number;
  super: number;
  cubes: number;
  alive: boolean;
  /** Hidden in a bush — other clients dim them; the local client ignores this. */
  hidden: boolean;
  rank: number;
  kills: number;
}

/** A shot in flight. */
export interface ProjectileSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  kind: string;
}

/** A collectible power cube. */
export interface CubeSnapshot {
  id: string;
  x: number;
  y: number;
}

/** A breakable box. `hp`/`maxHp` drive how cracked the crate looks. */
export interface BoxSnapshot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}

/** Everything about the match flow + poison zone, polled each frame by the game. */
export interface MatchInfo {
  phase: string;
  phaseTimeLeft: number;
  aliveCount: number;
  winnerName: string;
  safeMinX: number;
  safeMinY: number;
  safeMaxX: number;
  safeMaxY: number;
}

/**
 * A landed hit (for floating damage numbers + sparks). Position is the impact
 * point in world units; `targetId` is the player that was hit. Poison damage
 * does NOT produce these (it ticks every frame — would spam).
 */
export interface HitEvent {
  x: number;
  y: number;
  amount: number;
  kind: string; // "main" | "super"
  targetId: string;
}

/** A knockout (for the defeat explosion + kill feed). `killerId` is "" for poison. */
export interface KOEvent {
  x: number;
  y: number;
  victimId: string;
  victimName: string;
  killerId: string;
  killerName: string;
}

/** Callbacks the game provides so it can react to what the server tells us. */
export interface NetEvents {
  /** Fires once, when we've joined and received the arena size + terrain id. */
  onJoin: (arenaWidth: number, arenaHeight: number, mapId: string) => void;
  onPlayerAdd: (player: PlayerSnapshot) => void;
  onPlayerChange: (player: PlayerSnapshot) => void;
  onPlayerRemove: (id: string) => void;
  onProjectileAdd: (proj: ProjectileSnapshot) => void;
  onProjectileMove: (proj: ProjectileSnapshot) => void;
  onProjectileRemove: (id: string) => void;
  onCubeAdd: (cube: CubeSnapshot) => void;
  onCubeRemove: (id: string) => void;
  onBoxAdd: (box: BoxSnapshot) => void;
  onBoxChange: (box: BoxSnapshot) => void;
  onBoxRemove: (id: string) => void;
  /** A shot landed on someone (damage numbers / sparks). */
  onHit?: (hit: HitEvent) => void;
  /** Someone was defeated (explosion / kill feed). */
  onKO?: (ko: KOEvent) => void;
}

export class Network {
  private client: Client;
  private room?: Room;

  /** Our own player id, so the game knows which monster is "me". */
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
    return this.room?.state?.players?.size ?? 0;
  }

  /**
   * Join (or create) the room with the given code + chosen monster, then wire
   * the server's state changes to the game's callbacks.
   */
  async join(
    roomCode: string,
    name: string,
    monster: string,
    events: NetEvents,
  ): Promise<void> {
    this.room = await this.client.joinOrCreate(ROOM_NAME, { roomCode, name, monster });
    this.selfId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    // Deliver the arena size to the game as soon as the first state arrives.
    this.room.onStateChange.once((state) => {
      events.onJoin(state.width, state.height, state.mapId);
    });

    // ---- players ----
    $(this.room.state).players.onAdd((player, id) => {
      events.onPlayerAdd(playerSnap(id, player));
      $(player).onChange(() => events.onPlayerChange(playerSnap(id, player)));
    });
    $(this.room.state).players.onRemove((_player, id) => events.onPlayerRemove(id));

    // ---- projectiles ----
    $(this.room.state).projectiles.onAdd((proj, id) => {
      events.onProjectileAdd(projSnap(id, proj));
      $(proj).onChange(() => events.onProjectileMove(projSnap(id, proj)));
    });
    $(this.room.state).projectiles.onRemove((_proj, id) => events.onProjectileRemove(id));

    // ---- power cubes ----
    $(this.room.state).cubes.onAdd((cube, id) => events.onCubeAdd({ id, x: cube.x, y: cube.y }));
    $(this.room.state).cubes.onRemove((_cube, id) => events.onCubeRemove(id));

    // ---- breakable boxes ----
    $(this.room.state).boxes.onAdd((box, id) => {
      events.onBoxAdd(boxSnap(id, box));
      $(box).onChange(() => events.onBoxChange(boxSnap(id, box)));
    });
    $(this.room.state).boxes.onRemove((_box, id) => events.onBoxRemove(id));

    // ---- juice events (batched once per tick, outside the state sync) ----
    this.room.onMessage("fx", (list: Array<HitEvent & KOEvent & { t: string }>) => {
      for (const e of list) {
        if (e.t === "hit") events.onHit?.(e);
        else if (e.t === "ko") events.onKO?.(e);
      }
    });
  }

  // ---- intent we send to the server (it decides what actually happens) ----

  sendInput(x: number, y: number): void {
    this.room?.send("input", { x, y });
  }
  sendAim(x: number, y: number): void {
    this.room?.send("aim", { x, y });
  }
  /** Fire the main attack. Pass {0,0} for a quick-fire (server auto-aims). */
  sendFire(x: number, y: number): void {
    this.room?.send("fire", { x, y });
  }
  sendSuper(x: number, y: number): void {
    this.room?.send("super", { x, y });
  }

  /** A live snapshot of our own monster (for the HUD), or undefined if gone. */
  get self(): PlayerSnapshot | undefined {
    // state.players can be momentarily undefined between joining and the first
    // state sync; guard so a render frame in that window can't throw.
    const p = this.room?.state?.players?.get(this.selfId);
    return p ? playerSnap(this.selfId, p) : undefined;
  }

  /** A live snapshot of the match flow + poison zone, read each frame. */
  get match(): MatchInfo | undefined {
    const s = this.room?.state;
    if (!s) return undefined;
    return {
      phase: s.phase,
      phaseTimeLeft: s.phaseTimeLeft,
      aliveCount: s.aliveCount,
      winnerName: s.winnerName,
      safeMinX: s.safeMinX,
      safeMinY: s.safeMinY,
      safeMaxX: s.safeMaxX,
      safeMaxY: s.safeMaxY,
    };
  }

  /** Leave the room and clean up (e.g. when returning to the lobby). */
  leave(): void {
    this.room?.leave();
    this.room = undefined;
  }
}

/** Colyseus player schema -> plain snapshot the game understands. */
function playerSnap(
  id: string,
  p: {
    x: number; y: number; name: string; color: string; monster: string;
    facing: number; health: number; maxHealth: number; ammo: number;
    ammoMax: number; super: number; cubes: number; alive: boolean;
    hidden: boolean; rank: number; kills: number;
  },
): PlayerSnapshot {
  return {
    id,
    x: p.x,
    y: p.y,
    name: p.name,
    color: p.color,
    monster: p.monster,
    facing: p.facing,
    health: p.health,
    maxHealth: p.maxHealth,
    ammo: p.ammo,
    ammoMax: p.ammoMax,
    super: p.super,
    cubes: p.cubes,
    alive: p.alive,
    hidden: p.hidden,
    rank: p.rank,
    kills: p.kills,
  };
}

function projSnap(
  id: string,
  p: { x: number; y: number; radius: number; color: string; kind: string },
): ProjectileSnapshot {
  return { id, x: p.x, y: p.y, radius: p.radius, color: p.color, kind: p.kind };
}

function boxSnap(
  id: string,
  b: { x: number; y: number; w: number; h: number; hp: number; maxHp: number },
): BoxSnapshot {
  return { id, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp, maxHp: b.maxHp };
}
