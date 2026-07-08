/**
 * Refresh real repo stats in content/projects.json so the city grows on its own.
 * Updates each project's `commits` (building size) and `pushedAt` (construction
 * sites). Run weekly by .github/workflows/update-stats.yml.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'rhicksrad';
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

async function pushedAt(repo) {
  const { body } = await fetchJson(`https://api.github.com/repos/${OWNER}/${repo}`);
  return body.pushed_at.slice(0, 10);
}

const data = JSON.parse(await readFile(dataPath, 'utf8'));
let changed = 0;

for (const project of data.projects) {
  try {
    const [commits, pushed] = await Promise.all([
      commitCount(project.repo),
      pushedAt(project.repo)
    ]);
    if (commits !== project.commits || pushed !== project.pushedAt) {
      console.log(
        `${project.repo}: ${project.commits} -> ${commits} commits, pushed ${pushed}`
      );
      project.commits = commits;
      project.pushedAt = pushed;
      changed += 1;
    }
  } catch (error) {
    console.warn(`${project.repo}: skipped (${error.message})`);
  }
}

if (changed > 0) {
  await writeFile(dataPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${changed} project(s).`);
} else {
  console.log('No changes.');
}
