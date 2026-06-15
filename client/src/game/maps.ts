/**
 * Client-side copy of the static terrain layouts.
 *
 * Terrain never changes during a match, so rather than sync every rectangle the
 * server just sends a `mapId` (see MatchState) and the client looks the geometry
 * up here. This MUST stay in sync with `MAPS` in `server/src/config.ts` — the
 * server owns collision; this copy is purely for drawing the walls and bushes.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameMap {
  id: string;
  name: string;
  walls: Rect[];
  bushes: Rect[];
}

export const MAPS: GameMap[] = [
  {
    id: "crossroads",
    name: "The Crossroads",
    walls: [
      { x: 240, y: 240, w: 300, h: 90 },
      { x: 240, y: 240, w: 90, h: 300 },
      { x: 1460, y: 240, w: 300, h: 90 },
      { x: 1670, y: 240, w: 90, h: 300 },
      { x: 240, y: 1670, w: 300, h: 90 },
      { x: 240, y: 1460, w: 90, h: 300 },
      { x: 1460, y: 1670, w: 300, h: 90 },
      { x: 1670, y: 1460, w: 90, h: 300 },
      { x: 900, y: 560, w: 200, h: 80 },
      { x: 1360, y: 900, w: 80, h: 200 },
      { x: 900, y: 1360, w: 200, h: 80 },
      { x: 560, y: 900, w: 80, h: 200 },
    ],
    bushes: [
      { x: 820, y: 140, w: 360, h: 180 },
      { x: 820, y: 1680, w: 360, h: 180 },
      { x: 140, y: 820, w: 180, h: 360 },
      { x: 1680, y: 820, w: 180, h: 360 },
      { x: 620, y: 620, w: 180, h: 180 },
      { x: 1200, y: 620, w: 180, h: 180 },
      { x: 620, y: 1200, w: 180, h: 180 },
      { x: 1200, y: 1200, w: 180, h: 180 },
    ],
  },
  {
    id: "fanghollow",
    name: "Fang Hollow",
    walls: [
      { x: 300, y: 520, w: 90, h: 360 },
      { x: 300, y: 520, w: 420, h: 90 },
      { x: 630, y: 610, w: 90, h: 300 },
      { x: 1610, y: 1120, w: 90, h: 360 },
      { x: 1280, y: 1390, w: 420, h: 90 },
      { x: 1280, y: 1090, w: 90, h: 300 },
    ],
    bushes: [
      { x: 360, y: 200, w: 1280, h: 160 },
      { x: 360, y: 1640, w: 1280, h: 160 },
      { x: 760, y: 600, w: 280, h: 160 },
      { x: 960, y: 1240, w: 280, h: 160 },
      { x: 540, y: 940, w: 180, h: 220 },
      { x: 1280, y: 840, w: 180, h: 220 },
    ],
  },
];

/** Look up a layout by id (falls back to the first map if unknown/empty). */
export function mapById(id: string): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
