export interface ProfileLink {
  title: string;
  url: string;
  description?: string;
}

export interface ProfileData {
  name: string;
  headline: string;
  tagline: string;
  location: string;
  summary: string;
  skills: string[];
  principles: string[];
  projects: ProfileLink[];
  writing: ProfileLink[];
  talks: ProfileLink[];
  contact: {
    email: string;
    socials: ProfileLink[];
  };
}

declare module '*.json?url' {
  const src: string;
  export default src;
}

declare module '*.html?url' {
  const src: string;
  export default src;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}
