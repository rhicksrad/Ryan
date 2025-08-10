const gamesDataUrl = 'games.json';

const state = {
  games: [],
  query: ''
};

function createGameCard(game) {
  const card = document.createElement('article');
  card.className = 'game-card';

  const playUrl = `https://rhicksrad.github.io/${game.slug}`;
  const repoUrl = game.repo.startsWith('http') ? game.repo : `https://github.com/${game.repo}`;

  const thumb = game.thumb
    ? `<img class="thumb-img" src="${game.thumb}" alt="${game.title} cover" loading="lazy" />`
    : `<div class=\"thumb\" aria-hidden=\"true\">${game.short || game.title}</div>`;

  card.innerHTML = `
    ${thumb}
    <div class="card-body">
      <h3 class="game-title">${game.title}</h3>
      <p class="game-desc">${game.description || ''}</p>
      <div class="chip-row">
        <a class="chip" href="${playUrl}" target="_blank" rel="noopener noreferrer">🎮 Play</a>
        <a class="chip" href="${repoUrl}" target="_blank" rel="noopener noreferrer">🗂️ Repo</a>
      </div>
    </div>
  `;

  return card;
}

function render() {
  const grid = document.getElementById('gamesGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  const filtered = state.games.filter(g =>
    !state.query ||
    g.title.toLowerCase().includes(state.query) ||
    (g.description || '').toLowerCase().includes(state.query) ||
    g.slug.toLowerCase().includes(state.query)
  );

  filtered
    .sort((a, b) => (a.title.toLowerCase() > b.title.toLowerCase() ? 1 : -1))
    .forEach(game => grid.appendChild(createGameCard(game)));

  empty.hidden = filtered.length > 0;
}

async function loadGames() {
  try {
    const res = await fetch(gamesDataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load games');
    const data = await res.json();
    state.games = data.games || [];
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('gamesGrid').innerHTML = '<p>Could not load games.</p>';
  }
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
}

function setYear() {
  const yearEl = document.getElementById('year');
  yearEl.textContent = new Date().getFullYear();
}

document.addEventListener('DOMContentLoaded', () => {
  setYear();
  setupSearch();
  loadGames();
});


