import profileUrl from '../content/profile.json?url';
import type { ProfileData } from './types';

let profilePromise: Promise<ProfileData> | null = null;

export function loadProfile(): Promise<ProfileData> {
  if (!profilePromise) {
    profilePromise = fetch(profileUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load profile: ${response.status}`);
        }
        return response.json() as Promise<ProfileData>;
      })
      .catch((error) => {
        console.error(error);
        throw error;
      });
  }
  return profilePromise;
}
