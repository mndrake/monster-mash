import { Room, Client } from "colyseus";
import { MatchState } from "../schema/MatchState";
import { Player } from "../schema/Player";
import { Projectile } from "../schema/Projectile";
import { PowerCube } from "../schema/PowerCube";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TICK_RATE,
  MAX_PLAYERS,
  PLAYER_COLORS,
  MONSTERS,
  monsterById,
  type MonsterType,
  PHASE,
  COUNTDOWN_MS,
  ROUNDOVER_MS,
  REGEN_DELAY_MS,
  REGEN_FRACTION_PER_SEC,
  POWER_CUBE_COUNT,
  CUBE_HEALTH_BONUS,
  CUBE_DAMAGE_BONUS,
  CUBE_PICKUP_RADIUS,
  ZONE_GRACE_MS,
  ZONE_SHRINK_SPEED,
  ZONE_MIN_HALF,
  POISON_BASE_DPS,
  POISON_RAMP_DPS_PER_SEC,
} from "../config";

/** A Player object also remembers its own MapSchema key (sessionId). */
type KeyedPlayer = Player & { __key?: string };

/**
 * A MatchRoom is one Showdown arena that players join with a code.
 *
 * The server is AUTHORITATIVE: clients only send their *intent* (move here, aim
 * there, fire, use super). The server runs the whole simulation — movement,
 * shooting, damage, power cubes, and the closing poison — and broadcasts the
 * result. That stops cheating and keeps everyone in sync.
 *
 * A room runs a continuous series of short rounds so nobody waits long:
 *   COUNTDOWN ("3… 2… 1…")  ->  PLAYING (last monster standing)  ->  ROUNDOVER
 *   (winner banner)  ->  COUNTDOWN again.
 */
export class MatchRoom extends Room<MatchState> {
  maxClients = MAX_PLAYERS;

  /** Monotonic clock in ms, advanced by the tick — used for all timers. */
  private now = 0;
  /** When the current PLAYING phase began (for the poison schedule). */
  private playStartAt = 0;
  /** Source of unique ids for projectiles and cubes. */
  private nextId = 1;

  onCreate(options: { roomCode?: string }) {
    this.state = new MatchState();
    this.state.width = ARENA_WIDTH;
    this.state.height = ARENA_HEIGHT;
    this.state.roomCode = (options?.roomCode ?? "").toUpperCase();

    // ---- client -> server messages (intent only) ----

    // Movement vector, each component clamped to [-1, 1].
    this.onMessage("input", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.inputX = clamp(msg.x, -1, 1);
      p.inputY = clamp(msg.y, -1, 1);
    });

    // Aim direction (where the monster is pointing). Updates facing for render.
    this.onMessage("aim", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const len = Math.hypot(msg.x, msg.y);
      if (len > 0.001) {
        p.aimX = msg.x / len;
        p.aimY = msg.y / len;
        p.facing = Math.atan2(p.aimY, p.aimX);
      }
    });

    // Fire the main attack toward (x, y). Zero vector = "quick fire" (auto-aim).
    this.onMessage("fire", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.wantFire = true;
      p.fireDirX = msg?.x ?? 0;
      p.fireDirY = msg?.y ?? 0;
    });

    // Fire the super toward (x, y) if it's charged.
    this.onMessage("super", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.wantSuper = true;
      p.superDirX = msg?.x ?? 0;
      p.superDirY = msg?.y ?? 0;
    });

    this.setSimulationInterval(
      (deltaMs) => this.update(deltaMs),
      1000 / TICK_RATE,
    );

    // Kick off the first round.
    this.beginCountdown();

    console.log(`Room created with code "${this.state.roomCode}".`);
  }

  // =========================================================================
  //  Round lifecycle
  // =========================================================================

  /** Reset the arena and start the "3… 2… 1…" countdown to a new round. */
  private beginCountdown() {
    this.state.phase = PHASE.COUNTDOWN;
    this.state.phaseTimeLeft = COUNTDOWN_MS;
    this.state.winnerName = "";
    this.resetRound();
  }

  /** Respawn everyone, reset the zone, clear shots, and scatter fresh cubes. */
  private resetRound() {
    this.state.projectiles.clear();
    this.state.cubes.clear();

    // Safe zone starts as the whole arena.
    this.state.safeMinX = 0;
    this.state.safeMinY = 0;
    this.state.safeMaxX = this.state.width;
    this.state.safeMaxY = this.state.height;

    // Scatter power cubes (kept away from the very edges).
    const margin = 200;
    for (let i = 0; i < POWER_CUBE_COUNT; i++) {
      this.spawnCube(
        margin + Math.random() * (this.state.width - 2 * margin),
        margin + Math.random() * (this.state.height - 2 * margin),
      );
    }

    // Respawn every player at full strength in a spread-out spot.
    this.state.players.forEach((p) => this.respawn(p));
    this.state.aliveCount = this.state.players.size;
  }

  /** Put one player back to a fresh, full-health start. */
  private respawn(p: Player) {
    const type = monsterById(p.monster);
    p.maxHealth = type.maxHealth;
    p.health = type.maxHealth;
    p.ammoMax = type.ammoMax;
    p.ammo = type.ammoMax;
    p.super = 0;
    p.cubes = 0;
    p.kills = 0;
    p.rank = 0;
    p.alive = true;
    p.lastDamageAt = -100000;
    p.lastFireAt = -100000;
    // Spawn around the rim so monsters don't start on top of each other.
    const angle = Math.random() * Math.PI * 2;
    const cx = this.state.width / 2;
    const cy = this.state.height / 2;
    const r = Math.min(this.state.width, this.state.height) * 0.4;
    p.x = clamp(cx + Math.cos(angle) * r, type.radius, this.state.width - type.radius);
    p.y = clamp(cy + Math.sin(angle) * r, type.radius, this.state.height - type.radius);
    p.facing = Math.atan2(cy - p.y, cx - p.x); // face the middle
    p.aimX = Math.cos(p.facing);
    p.aimY = Math.sin(p.facing);
  }

  /** End the round on a winner (or nobody) and show the banner. */
  private endRound() {
    // Whoever is still alive placed 1st.
    let winner: Player | undefined;
    this.state.players.forEach((p) => {
      if (p.alive) {
        p.rank = 1;
        winner = p;
      }
    });
    this.state.winnerName = winner ? winner.name : "";
    this.state.phase = PHASE.ROUNDOVER;
    this.state.phaseTimeLeft = ROUNDOVER_MS;
  }

  // =========================================================================
  //  Main tick
  // =========================================================================

  update(deltaMs: number) {
    this.now += deltaMs;
    const dt = deltaMs / 1000;

    this.state.phaseTimeLeft = Math.max(0, this.state.phaseTimeLeft - deltaMs);

    if (this.state.phase === PHASE.COUNTDOWN) {
      if (this.state.phaseTimeLeft <= 0) {
        this.state.phase = PHASE.PLAYING;
        this.playStartAt = this.now;
      }
      return; // monsters are frozen during the countdown
    }

    if (this.state.phase === PHASE.ROUNDOVER) {
      if (this.state.phaseTimeLeft <= 0) this.beginCountdown();
      return;
    }

    // ---- PLAYING ----
    this.simulatePlayers(dt);
    this.simulateProjectiles(dt);
    this.applyPoison(dt);
    this.recountAndMaybeEnd();
  }

  /** Movement, ammo reload, health regen, cube pickup, and firing. */
  private simulatePlayers(dt: number) {
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      const type = monsterById(p.monster);

      // --- move ---
      let dx = p.inputX;
      let dy = p.inputY;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      p.x = clamp(p.x + dx * type.speed * dt, type.radius, this.state.width - type.radius);
      p.y = clamp(p.y + dy * type.speed * dt, type.radius, this.state.height - type.radius);

      // --- reload ammo over time ---
      if (p.ammo < type.ammoMax) {
        p.ammo = Math.min(type.ammoMax, p.ammo + (dt * 1000) / type.reloadMs);
      }

      // --- regenerate health if we've avoided damage for a moment ---
      if (p.health < p.maxHealth && this.now - p.lastDamageAt >= REGEN_DELAY_MS) {
        p.health = Math.min(
          p.maxHealth,
          p.health + p.maxHealth * REGEN_FRACTION_PER_SEC * dt,
        );
      }

      // --- pick up any power cube we're standing on ---
      this.state.cubes.forEach((cube, id) => {
        if (Math.hypot(cube.x - p.x, cube.y - p.y) <= CUBE_PICKUP_RADIUS) {
          this.collectCube(p, type);
          this.state.cubes.delete(id);
        }
      });

      // --- super first (it's the big play), then main fire ---
      if (p.wantSuper) {
        if (p.super >= 1) this.fireSuper(p, type);
        p.wantSuper = false;
      }
      if (p.wantFire) {
        if (p.ammo >= 1 && this.now - p.lastFireAt >= type.attackCooldownMs) {
          this.fireMain(p, type);
        }
        p.wantFire = false;
      }
    });
  }

  /** Raise a monster's health and damage for collecting a cube. */
  private collectCube(p: Player, type: MonsterType) {
    p.cubes += 1;
    const newMax = Math.round(type.maxHealth * (1 + CUBE_HEALTH_BONUS * p.cubes));
    const gain = newMax - p.maxHealth;
    p.maxHealth = newMax;
    p.health = Math.min(newMax, p.health + Math.max(0, gain)); // heal by the bonus
  }

  /** Current damage multiplier from collected cubes. */
  private damageMul(p: Player): number {
    return 1 + CUBE_DAMAGE_BONUS * p.cubes;
  }

  // =========================================================================
  //  Attacks
  // =========================================================================

  private fireMain(p: Player, type: MonsterType) {
    const dir = this.resolveDirection(p, p.fireDirX, p.fireDirY);
    const angle = Math.atan2(dir.y, dir.x);
    p.facing = angle;
    p.ammo -= 1;
    p.lastFireAt = this.now;
    this.spawnSpread(
      p,
      angle,
      "main",
      type.projectileCount,
      type.spreadDeg,
      type.projectileSpeed,
      type.projectileRange,
      type.projectileRadius,
      type.projectileDamage * this.damageMul(p),
    );
  }

  private fireSuper(p: Player, type: MonsterType) {
    const dir = this.resolveDirection(p, p.superDirX, p.superDirY);
    const angle = Math.atan2(dir.y, dir.x);
    p.facing = angle;
    p.super = 0;

    // Some monsters (Gnash) lunge forward when supering.
    if (type.superDashUnits > 0) {
      p.x = clamp(p.x + dir.x * type.superDashUnits, type.radius, this.state.width - type.radius);
      p.y = clamp(p.y + dir.y * type.superDashUnits, type.radius, this.state.height - type.radius);
    }

    this.spawnSpread(
      p,
      angle,
      "super",
      type.superCount,
      type.superSpreadDeg,
      type.superSpeed,
      type.superRange,
      type.superRadius,
      type.superDamage * this.damageMul(p),
    );
  }

  /** Spawn one or more projectiles fanned around a base angle. */
  private spawnSpread(
    owner: Player,
    baseAngle: number,
    kind: "main" | "super",
    count: number,
    spreadDeg: number,
    speed: number,
    range: number,
    radius: number,
    damage: number,
  ) {
    const spread = (spreadDeg * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      // Evenly fan the pellets across the spread, centered on baseAngle.
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const angle = baseAngle + t * spread;
      const proj = new Projectile();
      proj.x = owner.x;
      proj.y = owner.y;
      proj.radius = radius;
      proj.color = owner.color;
      proj.kind = kind;
      proj.ownerId = this.keyOf(owner);
      proj.vx = Math.cos(angle) * speed;
      proj.vy = Math.sin(angle) * speed;
      proj.damage = damage;
      proj.life = range / speed;
      this.state.projectiles.set(String(this.nextId++), proj);
    }
  }

  /**
   * Decide which way an attack flies. Priority:
   *   1. the explicit direction the client sent (dragging the fire stick),
   *   2. else auto-aim at the nearest enemy ("quick fire" tap),
   *   3. else the monster's current facing.
   */
  private resolveDirection(p: Player, dx: number, dy: number): { x: number; y: number } {
    const len = Math.hypot(dx, dy);
    if (len > 0.05) return { x: dx / len, y: dy / len };

    const target = this.nearestEnemy(p);
    if (target) {
      const tx = target.x - p.x;
      const ty = target.y - p.y;
      const tl = Math.hypot(tx, ty) || 1;
      return { x: tx / tl, y: ty / tl };
    }
    return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  }

  private nearestEnemy(p: Player): Player | undefined {
    let best: Player | undefined;
    let bestD = Infinity;
    const myKey = this.keyOf(p);
    this.state.players.forEach((other, key) => {
      if (key === myKey || !other.alive) return;
      const d = Math.hypot(other.x - p.x, other.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    });
    return best;
  }

  // =========================================================================
  //  Projectiles + damage
  // =========================================================================

  private simulateProjectiles(dt: number) {
    const dead: string[] = [];

    this.state.projectiles.forEach((proj, id) => {
      proj.life -= dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      // Off the edge of the arena, or out of life -> gone.
      if (
        proj.life <= 0 ||
        proj.x < 0 ||
        proj.y < 0 ||
        proj.x > this.state.width ||
        proj.y > this.state.height
      ) {
        dead.push(id);
        return;
      }

      // Hit the first live monster (other than the owner) it overlaps.
      let hit = false;
      this.state.players.forEach((target, key) => {
        if (hit || !target.alive || key === proj.ownerId) return;
        const type = monsterById(target.monster);
        if (Math.hypot(target.x - proj.x, target.y - proj.y) <= type.radius + proj.radius) {
          this.damagePlayer(target, proj.damage, proj.ownerId);
          // Reward the shooter: landing a hit charges their super.
          const shooter = this.state.players.get(proj.ownerId);
          if (shooter && shooter.alive) {
            shooter.super = Math.min(
              1,
              shooter.super + monsterById(shooter.monster).superChargePerHit,
            );
          }
          hit = true;
        }
      });
      if (hit) dead.push(id);
    });

    dead.forEach((id) => this.state.projectiles.delete(id));
  }

  /** Apply damage; handle defeat (drop cubes, award the kill, set placement). */
  private damagePlayer(target: Player, amount: number, attackerId: string) {
    if (!target.alive) return;
    target.health -= amount;
    target.lastDamageAt = this.now;
    if (target.health > 0) return;

    // ---- defeated ----
    target.health = 0;
    target.alive = false;
    // Placement = how many were alive (including them) at the moment of death.
    target.rank = this.countAlive() + 1; // +1: we just flipped alive=false above

    // Drop their cubes where they fell so a big lead can be looted.
    const drop = Math.min(target.cubes, 6);
    for (let i = 0; i < drop; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 40;
      this.spawnCube(
        clamp(target.x + Math.cos(a) * d, 0, this.state.width),
        clamp(target.y + Math.sin(a) * d, 0, this.state.height),
      );
    }

    // Credit the attacker (poison has an empty attackerId).
    const attacker = this.state.players.get(attackerId);
    if (attacker && attacker !== target) attacker.kills += 1;
  }

  // =========================================================================
  //  Poison zone
  // =========================================================================

  private applyPoison(dt: number) {
    const playMs = this.now - this.playStartAt;
    if (playMs <= ZONE_GRACE_MS) return; // grace period: zone is still full

    const shrinkSec = (playMs - ZONE_GRACE_MS) / 1000;
    const cx = this.state.width / 2;
    const cy = this.state.height / 2;
    const halfX = Math.max(ZONE_MIN_HALF, this.state.width / 2 - ZONE_SHRINK_SPEED * shrinkSec);
    const halfY = Math.max(ZONE_MIN_HALF, this.state.height / 2 - ZONE_SHRINK_SPEED * shrinkSec);
    this.state.safeMinX = cx - halfX;
    this.state.safeMaxX = cx + halfX;
    this.state.safeMinY = cy - halfY;
    this.state.safeMaxY = cy + halfY;

    const dps = POISON_BASE_DPS + POISON_RAMP_DPS_PER_SEC * shrinkSec;
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      const outside =
        p.x < this.state.safeMinX ||
        p.x > this.state.safeMaxX ||
        p.y < this.state.safeMinY ||
        p.y > this.state.safeMaxY;
      if (outside) this.damagePlayer(p, dps * dt, "");
    });
  }

  // =========================================================================
  //  Round-end check
  // =========================================================================

  private recountAndMaybeEnd() {
    const alive = this.countAlive();
    this.state.aliveCount = alive;
    const total = this.state.players.size;
    if (total === 0) return;
    // With 2+ players the round ends when one is left; solo, when they fall.
    const shouldEnd = total >= 2 ? alive <= 1 : alive <= 0;
    if (shouldEnd) this.endRound();
  }

  private countAlive(): number {
    let n = 0;
    this.state.players.forEach((p) => {
      if (p.alive) n++;
    });
    return n;
  }

  // =========================================================================
  //  Helpers + connection lifecycle
  // =========================================================================

  private spawnCube(x: number, y: number) {
    const cube = new PowerCube();
    cube.x = x;
    cube.y = y;
    this.state.cubes.set(String(this.nextId++), cube);
  }

  /** A player's MapSchema key is its sessionId; we stash it on the object once. */
  private keyOf(p: Player): string {
    return (p as KeyedPlayer).__key ?? "";
  }

  onJoin(client: Client, options: { name?: string; monster?: string }) {
    const p = new Player();
    (p as KeyedPlayer).__key = client.sessionId;

    // Pick the requested monster, or a random one if none/invalid was sent.
    const valid = MONSTERS.some((m) => m.id === options?.monster);
    p.monster = valid
      ? options!.monster!
      : MONSTERS[Math.floor(Math.random() * MONSTERS.length)].id;

    p.name = (options?.name || "Monster").slice(0, 16);
    p.color = PLAYER_COLORS[(this.clients.length - 1) % PLAYER_COLORS.length];

    this.respawn(p);
    // Joining mid-round, you sit out as a spectator until the next round.
    if (this.state.phase === PHASE.PLAYING) {
      p.alive = false;
      p.rank = 0;
    }

    this.state.players.set(client.sessionId, p);
    this.state.aliveCount = this.countAlive();
    console.log(`${p.name} joined as ${p.monster}. Players: ${this.state.players.size}`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.state.aliveCount = this.countAlive();
    console.log(`${client.sessionId} left. Players: ${this.state.players.size}`);
  }
}

/** Keep a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
