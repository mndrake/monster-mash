import { lookOf } from "./monsters";
import type { PlayerSnapshot } from "../net/Network";

/**
 * The waiting-room overlay shown while the room is in the "lobby" phase.
 *
 * It's a full-screen DOM panel that sits ABOVE the game canvas (matching the
 * existing DOM-lobby / net-status pattern rather than living inside Phaser). It
 * shows everyone currently in the room as they join, a session leaderboard
 * (cumulative wins + kills, persisted across rounds on the server), and — for
 * the host only — a "Start game" button. Everyone else sees "Waiting for host…".
 *
 * GameScene drives it: it toggles visibility on phase changes and calls
 * `render()` when the roster changes (player join/leave/score), NOT every frame.
 */
export class WaitingRoom {
  private el: HTMLDivElement;
  private listEl: HTMLOListElement;
  private countEl: HTMLSpanElement;
  private startBtn: HTMLButtonElement;
  private hintEl: HTMLDivElement;
  private leaveBtn: HTMLButtonElement;
  private onStartCb?: () => void;
  private onLeaveCb?: () => void;
  private shown = false;

  constructor(roomCode: string) {
    injectStyles();
    this.el = document.createElement("div");
    this.el.id = "waiting-room";
    this.el.innerHTML =
      `<div class="wr-panel">` +
      `<div class="wr-title">Waiting room</div>` +
      `<div class="wr-code">Room code <b>${escapeHtml(roomCode)}</b></div>` +
      `<div class="wr-label">Players (<span class="wr-count">0</span>) · Standings</div>` +
      `<ol class="wr-list"></ol>` +
      `<button type="button" class="wr-start">Start game</button>` +
      `<div class="wr-hint">Waiting for the host to start…</div>` +
      `<button type="button" class="wr-leave">Leave room</button>` +
      `</div>`;
    this.listEl = this.el.querySelector(".wr-list") as HTMLOListElement;
    this.countEl = this.el.querySelector(".wr-count") as HTMLSpanElement;
    this.startBtn = this.el.querySelector(".wr-start") as HTMLButtonElement;
    this.hintEl = this.el.querySelector(".wr-hint") as HTMLDivElement;
    this.leaveBtn = this.el.querySelector(".wr-leave") as HTMLButtonElement;
    this.startBtn.addEventListener("click", () => this.onStartCb?.());
    this.leaveBtn.addEventListener("click", () => this.onLeaveCb?.());
    this.el.style.display = "none";
    document.body.appendChild(this.el);
  }

  onStart(cb: () => void): void {
    this.onStartCb = cb;
  }

  /** Leave the room and return to the main lobby (to start/join a new game). */
  onLeave(cb: () => void): void {
    this.onLeaveCb = cb;
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.el.style.display = "flex";
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.style.display = "none";
  }

  get visible(): boolean {
    return this.shown;
  }

  /**
   * Rebuild the roster + leaderboard. Sorted by wins, then total kills, then
   * name — so the list doubles as the standings. Host gets a crown; you're
   * highlighted. Call this on join/leave/score changes, not per frame.
   */
  render(roster: PlayerSnapshot[], hostId: string, selfId: string): void {
    this.countEl.textContent = String(roster.length);

    const sorted = [...roster].sort(
      (a, b) => b.wins - a.wins || b.totalKills - a.totalKills || a.name.localeCompare(b.name),
    );

    this.listEl.innerHTML = sorted
      .map((p) => {
        const look = lookOf(p.monster);
        const isHost = p.id === hostId;
        const isSelf = p.id === selfId;
        const tags =
          (isHost ? `<span class="wr-tag wr-host">👑 host</span>` : "") +
          (isSelf ? `<span class="wr-tag wr-you">you</span>` : "");
        return (
          `<li class="wr-row${isSelf ? " is-self" : ""}">` +
          `<span class="wr-emoji">${look.emoji}</span>` +
          `<span class="wr-name">${escapeHtml(p.name)}${tags}</span>` +
          `<span class="wr-stat" title="Rounds won">🏆 ${p.wins}</span>` +
          `<span class="wr-stat" title="Total kills">⚔️ ${p.totalKills}</span>` +
          `</li>`
        );
      })
      .join("");

    // Host sees the Start button; everyone else sees the waiting hint.
    const isHost = selfId !== "" && selfId === hostId;
    this.startBtn.style.display = isHost ? "block" : "none";
    this.hintEl.style.display = isHost ? "none" : "block";
    this.startBtn.textContent =
      roster.length > 1 ? `Start game (${roster.length} players)` : "Start game";
  }

  destroy(): void {
    this.el.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    #waiting-room {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: safe center;
      justify-content: center;
      padding: 16px;
      overflow: auto;
      background: #10101a;
      color: #eaeaf2;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    #waiting-room .wr-panel {
      width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #1b1b2f;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }
    #waiting-room .wr-title { font-size: 24px; font-weight: 800; }
    #waiting-room .wr-code { opacity: 0.8; font-size: 14px; }
    #waiting-room .wr-code b { letter-spacing: 2px; font-size: 16px; color: #fff; }
    #waiting-room .wr-label {
      margin-top: 6px; font-size: 12px; text-transform: uppercase;
      letter-spacing: 1px; opacity: 0.6;
    }
    #waiting-room .wr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    #waiting-room .wr-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
    }
    #waiting-room .wr-row.is-self { background: rgba(91, 140, 255, 0.18); }
    #waiting-room .wr-emoji { font-size: 22px; flex: none; }
    #waiting-room .wr-name { flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #waiting-room .wr-stat { flex: none; font-variant-numeric: tabular-nums; opacity: 0.9; font-size: 14px; }
    #waiting-room .wr-tag {
      margin-left: 8px; padding: 2px 6px; border-radius: 999px;
      font-size: 11px; font-weight: 700; vertical-align: middle;
    }
    #waiting-room .wr-host { background: rgba(255, 209, 102, 0.22); color: #ffd166; }
    #waiting-room .wr-you { background: rgba(91, 140, 255, 0.3); color: #cdddff; }
    #waiting-room .wr-start {
      margin-top: 8px; padding: 14px; border: 0; border-radius: 12px;
      background: #5b8cff; color: #0b1020; font: 700 17px/1 inherit; cursor: pointer;
    }
    #waiting-room .wr-start:active { transform: translateY(1px); }
    #waiting-room .wr-hint { margin-top: 8px; text-align: center; opacity: 0.7; font-size: 14px; }
    #waiting-room .wr-leave {
      margin-top: 4px; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px; background: transparent; color: #c7c7e0;
      font: 600 14px/1 inherit; cursor: pointer;
    }
    #waiting-room .wr-leave:active { transform: translateY(1px); }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
