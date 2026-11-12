import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { draftProject, guessDistrict, isIgnored, titleFromRepo } from '../../scripts/update-stats.mjs';

const repo = (over: Record<string, unknown>) => ({
  name: 'thing',
  description: null,
  language: 'TypeScript',
  topics: [],
  homepage: '',
  has_pages: false,
  pushed_at: '2026-11-01T10:00:00Z',
  ...over
});

describe('repo discovery', () => {
  it('honours exact names and prefix patterns in the ignore list', () => {
    const ignore = ['shahanshah-voice-*', 'ryana'];
    expect(isIgnored('shahanshah-voice-fr', ignore)).toBe(true);
    expect(isIgnored('Ryana', ignore)).toBe(true);
    expect(isIgnored('shahanshah', ignore)).toBe(false);
    expect(isIgnored('anything')).toBe(false);
  });

  it('turns repo names into titles', () => {
    expect(titleFromRepo('persian-strike')).toBe('Persian Strike');
    expect(titleFromRepo('GalaxyBrain')).toBe('Galaxy Brain');
    expect(titleFromRepo('NBA')).toBe('NBA');
  });

  it('zones by what the repo says about itself', () => {
    expect(guessDistrict(repo({ language: 'GDScript' }), '')).toBe('arcade');
    expect(guessDistrict(repo({ description: 'A dashboard of county health data with maps' }), '')).toBe('data');
    expect(guessDistrict(repo({ description: 'An 808 drum machine and synth for making music' }), '')).toBe('creative');
    expect(guessDistrict(repo({ description: 'Site for a dental practice' }), '')).toBe('web');
  });

  it('drafts a complete entry from a README', () => {
    const readme = [
      '# Pharaoh',
      '',
      '![shot](shot.png)',
      '',
      'A city builder set on the Nile. Raise pyramids and manage the yearly flood.',
      '',
      '## Run',
      '',
      '```',
      'npm install',
      '```',
      '',
      'Trade caravans arrive every season with cedar and copper.'
    ].join('\n');
    const project = draftProject(repo({ name: 'Pharaoh', language: 'GDScript', has_pages: true }), readme, 42);
    expect(project).toMatchObject({
      id: 'pharaoh',
      title: 'Pharaoh',
      repo: 'Pharaoh',
      district: 'arcade',
      commits: 42,
      pushedAt: '2026-11-01',
      demo: 'https://rhicksrad.github.io/Pharaoh/',
      auto: true
    });
    expect(project.blurb).toContain('city builder');
    expect(project.quotes.length).toBeGreaterThan(0);
    expect(project.quotes.join(' ')).not.toMatch(/npm install|shot\.png/);
  });

  it('still drafts something sensible with no README or description', () => {
    const project = draftProject(repo({ name: 'mystery-box', language: null }), '', 1);
    expect(project.title).toBe('Mystery Box');
    expect(project.blurb.length).toBeGreaterThan(10);
    expect(project.quotes.length).toBeGreaterThan(0);
    expect(project.demo).toBeNull();
  });
});
