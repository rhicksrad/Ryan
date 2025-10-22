import { NavLink, Outlet } from 'react-router-dom';
import { useMemo } from 'react';

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
      <header className="site-header">
        <div className="inner">
          <div>
            <p className="eyebrow">Ryan Hicks</p>
            <h1 className="site-title">Creative Developer & Technical Artist</h1>
          </div>
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
                    {item.label}
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
          <p>© {year} Ryan Hicks. Built with Vite, React, and a love for playful code.</p>
          <div className="footer-links">
            <a href="https://github.com/rhicksrad" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/ryan-hicks-10790a206/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
