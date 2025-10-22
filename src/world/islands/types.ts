import type { ProfileContent } from '../../types.d.ts';
import { AssetLoader } from '../../utils/AssetLoader';
import { AudioController } from '../../utils/Audio';

export interface IslandContext {
  content: ProfileContent;
  assets: AssetLoader;
  audio: AudioController;
  reducedMotion: () => boolean;
}

export interface IslandResult {
  group: import('three').Group;
  hotspot: import('../Hotspot').Hotspot;
}
