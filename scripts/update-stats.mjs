/**
 * Keep the city in step with GitHub. Run weekly by .github/workflows/update-stats.yml
 * and again at deploy time by pages.yml.
 *
 *  1. Refresh every project's `commits` (building size) and `pushedAt`
 *     (construction sites).
 *  2. Discover public repos that are not in the city yet and break ground for
 *     them: district, blurb, and citizen quotes are drafted from the repo's own
 *     description and README. Drafted entries carry `"auto": true` so they are
 *     easy to find and polish by hand later.
 *
 * Repos listed in `ignore` in content/projects.json (exact names or `prefix*`
 * patterns) never get a building.
 *
 * Flags: --no-discover  only refresh existing projects
 *        --dry-run      print what would change, write nothing
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OWNER = 'rhicksrad';
const SITE_REPO = 'Ryan';
const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'projects.json');

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'project-city-stats'
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return { body: await res.json(), link: res.headers.get('link') ?? '' };
}

async function commitCount(repo) {
  const { body, link } = await fetchJson(
    `https://api.github.com/repos/${OWNER}/${repo}/commits?per_page=1`
  );
  const match = link.match(/page=(\d+)>; rel="last"/);
  return match ? Number(match[1]) : body.length;
}

async function listRepos() {
  const repos = [];
  for (let page = 1; page <= 10; page += 1) {
    const { body } = await fetchJson(
      `https://api.github.com/users/${OWNER}/repos?type=owner&sort=pushed&per_page=100&page=${page}`
    );
    repos.push(...body);
    if (body.length < 100) break;
  }
  return repos;
}

async function readme(repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/readme`, {
      headers: { ...headers, Accept: 'application/vnd.github.raw+json' }
    });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Drafting an entry for a repo nobody has described yet. Pure functions, so
// they can be tested without the network.
// ---------------------------------------------------------------------------

export function isIgnored(name, ignore = []) {
  return ignore.some((rule) =>
    rule.endsWith('*') ? name.toLowerCase().startsWith(rule.slice(0, -1).toLowerCase()) : rule.toLowerCase() === name.toLowerCase()
  );
}

/** "persian-strike" -> "Persian Strike", "GalaxyBrain" -> "Galaxy Brain", "NBA" -> "NBA". */
export function titleFromRepo(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((word) => (word === word.toUpperCase() ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Markdown -> plain prose paragraphs, with headings kept as `# Title` lines. */
export function plainReadme(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/\r/g, '');
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function draftCopy(repo, markdown) {
  const text = plainReadme(markdown);
  const lines = text.split('\n').map((line) => line.trim());
  const heading = lines.find((line) => /^#\s+\S/.test(line))?.replace(/^#\s+/, '');

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !/^[-+] /.test(p) && p.length > 40);
  const sentences = paragraphs
    .flatMap((p) => p.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 110 && /^[A-Z0-9"'“]/.test(s) && !/https?:/.test(s));

  const title = heading && heading.length <= 40 ? heading : titleFromRepo(repo.name);
  const language = repo.language ?? 'Mixed';
  const blurb = clip(
    repo.description?.trim() || paragraphs[0] || `${title} — a ${language} project, freshly broken ground.`,
    220
  );
  const quotes = sentences.filter((s) => !blurb.startsWith(s)).slice(0, 2);
  if (quotes.length === 0) quotes.push(`${title}: new in town.`, `Built in ${language}.`);
  return { title, blurb, quotes };
}

const DISTRICT_HINTS = {
  arcade: /\b(games?|play(able)?|arcade|roguelike|puzzles?|cards?|poker|deck|shooter|rpg|strike|godot|level|boss|quest|dungeon)\b/gi,
  data: /\b(data|datasets?|dashboards?|visuali[sz]ations?|charts?|maps?|stat(s|istics)|analytics|atlas|metrics|research|proof|conjecture)\b/gi,
  creative: /\b(music|art|audio|synth|drum|draw|generative|creature|story|stories|comedy|paint|poem|sound)\b/gi
};
const DISTRICT_LANGS = { GDScript: 'arcade', 'C#': 'arcade', Assembly: 'arcade', Python: 'data', R: 'data', 'Jupyter Notebook': 'data' };

/** Guess which district a repo belongs in from how it describes itself. */
export function guessDistrict(repo, markdown) {
  const text = `${repo.name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')} ${plainReadme(markdown).slice(0, 1500)}`;
  let best = DISTRICT_LANGS[repo.language] ?? 'web';
  let bestScore = DISTRICT_LANGS[repo.language] ? 1.5 : 0.5; // web is the default; a hint or two outvotes it
  for (const [district, pattern] of Object.entries(DISTRICT_HINTS)) {
    const score = (text.match(pattern) ?? []).length;
    if (score > bestScore) {
      best = district;
      bestScore = score;
    }
  }
  return best;
}

export function draftProject(repo, markdown, commits) {
  const { title, blurb, quotes } = draftCopy(repo, markdown);
  return {
    id: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title,
    repo: repo.name,
    district: guessDistrict(repo, markdown),
    lang: repo.language ?? 'Mixed',
    blurb,
    demo: repo.homepage || (repo.has_pages ? `https://${OWNER.toLowerCase()}.github.io/${repo.name}/` : null),
    commits,
    quotes,
    pushedAt: repo.pushed_at.slice(0, 10),
    auto: true
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const discover = !process.argv.includes('--no-discover');
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  let changed = 0;

  const repos = await listRepos();
  const byName = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo]));

  for (const project of data.projects) {
    const repo = byName.get(project.repo.toLowerCase());
    if (!repo) {
      console.warn(`${project.repo}: not found among public repos, left as is`);
      continue;
    }
    try {
      const commits = await commitCount(project.repo);
      const pushed = repo.pushed_at.slice(0, 10);
      if (commits !== project.commits || pushed !== project.pushedAt || project.estimated) {
        console.log(`${project.repo}: ${project.commits} -> ${commits} commits, pushed ${pushed}`);
        project.commits = commits;
        project.pushedAt = pushed;
        delete project.estimated;
        changed += 1;
      }
    } catch (error) {
      console.warn(`${project.repo}: skipped (${error.message})`);
    }
  }

  if (discover) {
    const known = new Set(data.projects.map((p) => p.repo.toLowerCase()));
    for (const repo of repos) {
      if (
        known.has(repo.name.toLowerCase()) ||
        repo.name === SITE_REPO ||
        repo.fork ||
        repo.archived ||
        repo.private ||
        isIgnored(repo.name, data.ignore)
      ) {
        continue;
      }
      try {
        const [commits, markdown] = await Promise.all([commitCount(repo.name), readme(repo.name)]);
        if (commits === 0) continue;
        const project = draftProject(repo, markdown, commits);
        data.projects.push(project);
        console.log(`${repo.name}: broke ground in ${project.district} (${commits} commits)`);
        changed += 1;
      } catch (error) {
        console.warn(`${repo.name}: could not be added (${error.message})`);
      }
    }
  }

  if (changed === 0) {
    console.log('No changes.');
  } else if (dryRun) {
    console.log(`${changed} change(s), not written (--dry-run).`);
  } else {
    await writeFile(dataPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${changed} project(s).`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
