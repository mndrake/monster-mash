import { registerSW } from "virtual:pwa-register";

/**
 * PWA update flow ("new version available" banner).
 *
 * The service worker is set to `registerType: "prompt"` (vite.config.ts), so a
 * fresh deploy does NOT silently take over. Instead vite-plugin-pwa calls our
 * `onNeedRefresh` once the new SW is downloaded and waiting; we show a small
 * banner, and only when the player taps "Update" do we activate the new SW and
 * reload onto the new build. This avoids the stale-cache trap where an old
 * service worker kept serving a broken build until every tab was closed.
 *
 * Self-contained: it injects its own DOM + styles, so nothing in index.html or
 * style.css needs to know about it. No-op in dev (no SW registered there).
 */
export function setupPwaUpdates(): void {
  // `updateSW(true)` activates the waiting SW and reloads the page.
  const updateSW = registerSW({
    onNeedRefresh() {
      showBanner(() => updateSW(true));
    },
  });
}

function showBanner(onUpdate: () => void): void {
  // Don't stack banners if onNeedRefresh somehow fires twice.
  if (document.getElementById("pwa-update")) return;

  const bar = document.createElement("div");
  bar.id = "pwa-update";
  bar.setAttribute("role", "status");
  bar.innerHTML =
    `<span class="pwa-update-text">A new version is available.</span>` +
    `<button type="button" class="pwa-update-btn">Update</button>`;

  const btn = bar.querySelector(".pwa-update-btn") as HTMLButtonElement;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Updating…";
    onUpdate();
  });

  injectStyles();
  document.body.appendChild(bar);
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    #pwa-update {
      position: fixed;
      left: 50%;
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: calc(100vw - 24px);
      padding: 10px 12px 10px 16px;
      border-radius: 999px;
      background: #1b1b2f;
      color: #eaeaf2;
      font: 600 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    #pwa-update .pwa-update-text { white-space: nowrap; }
    #pwa-update .pwa-update-btn {
      flex: none;
      padding: 8px 16px;
      border: 0;
      border-radius: 999px;
      background: #5b8cff;
      color: #0b1020;
      font: inherit;
      cursor: pointer;
    }
    #pwa-update .pwa-update-btn:disabled { opacity: 0.6; cursor: default; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
