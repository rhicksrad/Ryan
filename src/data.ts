import raw from '../content/projects.json';

export interface Profile {
  name: string;
  github: string;
  tagline: string;
  about: string;
  linkedin: string;
  email: string;
}

export interface District {
  id: string;
  name: string;
  color: string;
  blurb: string;
}

export interface Project {
  id: string;
  title: string;
  repo: string;
  district: string;
  /** GitHub's main language for the repo; missing when GitHub detects none. */
  lang?: string;
  /** Real commit count — drives the building's size in the world. */
  commits: number;
  blurb: string;
  demo: string | null;
  /** README lines spoken by the project's citizens. */
  quotes: string[];
  /** Last push date (ISO). Recently active projects get a construction site. */
  pushedAt: string;
  /** When the repo was created (ISO): the order the town was built in. */
  createdAt?: string;
  /** Commit count is a placeholder until the next stats refresh. */
  estimated?: boolean;
  /** Entry was drafted automatically from the repo's README. */
  auto?: boolean;
}

/** Pushed to within the last 30 days → crane and scaffolding. */
export function isUnderConstruction(project: Project): boolean {
  return Date.now() - new Date(project.pushedAt).getTime() < 30 * 86_400_000;
}

/** Architecture tier derived from how much work went into the project. */
export function tierOf(commits: number): 0 | 1 | 2 | 3 | 4 {
  if (commits >= 150) return 4; // downtown skyscraper with billboards
  if (commits >= 60) return 3; // commercial mid-rise
  if (commits >= 25) return 2; // large two-story suburban house
  if (commits >= 6) return 1; // modest suburban house
  return 0; // dilapidated shack
}

export interface WorldData {
  profile: Profile;
  districts: District[];
  projects: Project[];
  /** Repos that never get a building (exact names or `prefix*`). */
  ignore?: string[];
}

export const data = raw as WorldData;

export function districtOf(project: Project): District {
  const district = data.districts.find((d) => d.id === project.district);
  if (!district) throw new Error(`Unknown district: ${project.district}`);
  return district;
}

export function repoUrl(project: Project): string {
  return `${data.profile.github}/${project.repo}`;
}
