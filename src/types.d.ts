import type { DataTexture, Object3D } from 'three';

export type RouteName =
  | '#home'
  | '#cooking'
  | '#it'
  | '#gardening'
  | '#ai'
  | '#music'
  | '#projects'
  | '#writing'
  | '#talks'
  | '#resume'
  | '#contact';

export type InterestKey = 'cooking' | 'it' | 'gardening' | 'ai' | 'music';

export interface ProfileSocial {
  github: string;
  linkedin: string;
  x: string;
  website: string;
}

export interface ProfileProject {
  name: string;
  role: string;
  stack: string[];
  summary: string;
  highlights: string[];
  links: {
    github: string;
    demo: string;
  };
}

export interface ProfilePost {
  title: string;
  date: string;
  summary: string;
  url: string;
}

export interface ProfileTalk {
  title: string;
  event: string;
  date: string;
  link: string;
}

export interface ProfileInterest {
  summary: string;
  links: string[];
}

export interface ProfileContact {
  cta: string;
  availability: string;
}

export interface ProfileContent {
  name: string;
  tagline: string;
  location: string;
  email: string;
  social: ProfileSocial;
  bio_short: string;
  bio_long: string;
  skills: string[];
  principles: string[];
  projects: ProfileProject[];
  posts: ProfilePost[];
  talks: ProfileTalk[];
  interests: Record<InterestKey, ProfileInterest>;
  contact: ProfileContact;
}

export interface LoadedAssets {
  noiseTexture: DataTexture;
  smokeTexture: DataTexture;
}

export interface HotspotUpdateContext {
  delta: number;
  elapsed: number;
  reducedMotion: boolean;
  audioActive: boolean;
}

export interface HotspotDefinition {
  name: string;
  route: RouteName;
  ariaLabel: string;
  mesh: Object3D;
  hitArea: Object3D;
  interestKey: InterestKey;
  summary: string;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}

declare module '*.html?url' {
  const src: string;
  export default src;
}

declare module '*?url' {
  const src: string;
  export default src;
}
