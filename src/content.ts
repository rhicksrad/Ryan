import profile from '../content/profile.json';
import type { ProfileContent } from './types';

export const content: { profile: ProfileContent } = {
  profile: profile as ProfileContent
};

export type { ProfileContent };
