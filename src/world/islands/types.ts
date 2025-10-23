import type { Hotspot } from '../Hotspot';

export interface IslandHotspotBundle {
  main: Hotspot;
  extras?: Hotspot[];
}
