export interface ProjectLink {
  github?: string;
  demo?: string;
}

export interface Project {
  name: string;
  role: string;
  stack: string[];
  summary: string;
  highlights: string[];
  links: ProjectLink;
}

export interface Post {
  title: string;
  date: string;
  summary: string;
  url: string;
}

export interface Talk {
  title: string;
  event: string;
  date: string;
  link: string;
}

export interface Interest {
  summary: string;
  links: string[];
}

export interface ProfileContent {
  name: string;
  tagline: string;
  location: string;
  email: string;
  social: Record<string, string>;
  bio_short: string;
  bio_long: string;
  skills: string[];
  principles: string[];
  projects: Project[];
  posts: Post[];
  talks: Talk[];
  interests: Record<string, Interest>;
}
