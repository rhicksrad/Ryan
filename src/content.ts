import type { ProfileContent, Project, Post, Talk, Interest } from './types.d.ts';

let cache: ProfileContent | null = null;

export async function loadContent(): Promise<ProfileContent> {
  if (cache) return cache;
  const response = await fetch('content/profile.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Failed to load profile content');
  }
  cache = (await response.json()) as ProfileContent;
  return cache;
}

export function getInterests(content: ProfileContent): Record<string, Interest> {
  return content.interests;
}

export function getProjects(content: ProfileContent): Project[] {
  return content.projects;
}

export function getPosts(content: ProfileContent): Post[] {
  return content.posts;
}

export function getTalks(content: ProfileContent): Talk[] {
  return content.talks;
}
