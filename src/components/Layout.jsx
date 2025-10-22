import { NavLink, Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { site, siteLinks } from '../data/site.js';

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/experience', label: 'Experience' },
  { to: '/contact', label: 'Contact' },
];

function Layout() {
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="app-shell">
      <div className="ambient-grid" aria-hidden="true">
        <span className="orb orb-one" />
        <span className="orb orb-two" />
        <span className="orb orb-three" />
      </div>

      <header className="site-header">
        <div className="inner">
          <NavLink to="/" className="brand" aria-label="Back to home">
            <span className="brand-mark">RH</span>
            <span className="brand-copy">
              <span className="brand-name">{site.name}</span>
              <span className="brand-title">{site.title}</span>
            </span>
          </NavLink>

          <nav aria-label="Primary navigation">
            <ul className="nav-list">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      isActive ? 'nav-link active' : 'nav-link'
                    }
                  >
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="inner">
          <div>
            <p className="footer-eyebrow">Always shipping playful experiments</p>
            <p className="footer-copy">© {year} {site.name}. {site.tagline}</p>
          </div>
          <div className="footer-links">
            <a href={site.githubProfile} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={siteLinks.githubActions} target="_blank" rel="noreferrer">
              GitHub Actions
            </a>
            <a href={site.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
