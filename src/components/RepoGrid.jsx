import { useEffect, useState } from 'react';
import { site } from '../data/site.js';

const API_URL = `https://api.github.com/users/${site.githubUser}/repos?sort=updated&per_page=24`;

function RepoGrid() {
  const [repos, setRepos] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let isMounted = true;

    async function loadRepos() {
      setStatus('loading');

      try {
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error('Failed to load repositories');
        }

        const data = await response.json();

        if (isMounted) {
          setRepos(
            data
              .filter((repo) => !repo.fork)
              .map((repo) => ({
                id: repo.id,
                name: repo.name,
                description: repo.description,
                url: repo.html_url,
                topics: repo.topics,
                updatedAt: repo.updated_at,
                language: repo.language,
                stars: repo.stargazers_count,
              })),
          );
          setStatus('success');
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setStatus('error');
        }
      }
    }

    loadRepos();

    return () => {
      isMounted = false;
    };
  }, []);

  if (status === 'loading') {
    return <p className="status">Loading projects…</p>;
  }

  if (status === 'error') {
    return (
      <p className="status error">
        Unable to reach GitHub right now. Check back soon or explore directly on{' '}
        <a href={site.githubProfile} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
    );
  }

  if (repos.length === 0) {
    return <p className="status">No public projects yet—new experiments are always in the works.</p>;
  }

  return (
    <div className="repo-grid">
      {repos.map((repo) => (
        <article key={repo.id} className="repo-card">
          <header className="repo-heading">
            <h3>
              <a href={repo.url} target="_blank" rel="noreferrer">
                {repo.name}
              </a>
            </h3>
            <p className="repo-meta">
              {repo.language && <span className="repo-language">{repo.language}</span>}
              <span className="repo-stars">★ {repo.stars}</span>
              <time dateTime={repo.updatedAt}>Updated {new Date(repo.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
            </p>
          </header>
          <p className="repo-description">{repo.description ?? 'A new experiment in progress.'}</p>
          {repo.topics && repo.topics.length > 0 && (
            <ul className="repo-topics">
              {repo.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

export default RepoGrid;
