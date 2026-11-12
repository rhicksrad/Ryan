/// <reference types="vite/client" />
/**
 * Hand-directed poster art. Drop a file into `src/assets/art/` and it is picked
 * up by name: `poster-<project id>.webp` goes on that tower's billboards and its
 * panel, `emblem-<district id>.webp` goes on that district's signs and chips.
 */
const urls = import.meta.glob('./assets/art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

const find = (name: string): string | undefined => urls[`./assets/art/${name}.webp`];

export const posterUrl = (projectId: string): string | undefined => find(`poster-${projectId}`);
export const emblemUrl = (districtId: string): string | undefined => find(`emblem-${districtId}`);
