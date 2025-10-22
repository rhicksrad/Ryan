import SectionHeader from '../components/SectionHeader.jsx';
import { coreSkills, focusAreas } from '../data/skills.js';
import { site, siteLinks } from '../data/site.js';

function Home() {
  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-body">
          <p className="hero-eyebrow">Hi, I'm {site.name.split(' ')[0]}.</p>
          <h2 className="hero-title">
            I craft lush, kinetic experiences that merge game-feel intuition with fearless web exploration.
          </h2>
          <p className="hero-lede">
            From rhythm-driven prototypes and AI-assisted storytelling tools to tactile UI systems, I build work that
            feels alive. Each release blends art direction, technical rigor, and a penchant for playful details.
          </p>
          <div className="hero-ctas">
            <a className="button" href={site.githubProfile} target="_blank" rel="noreferrer">
              Explore GitHub
            </a>
            <a className="button ghost" href={site.linkedin} target="_blank" rel="noreferrer">
              Connect on LinkedIn
            </a>
          </div>
          <div className="hero-note">
            <span className="note-pill">Now shipping</span>
            <a href={siteLinks.githubActions} target="_blank" rel="noreferrer">
              Automated builds & tests on GitHub Actions →
            </a>
          </div>
        </div>

        <div className="hero-showcase">
          <article className="showcase-card primary">
            <p className="metric">Weekend jams → polished drops</p>
            <p>
              Rapidly iterating with Vite, React, and bespoke shaders to deliver playful experiments with motion-rich
              interfaces and buttery smooth performance.
            </p>
            <a href={site.githubProjects} target="_blank" rel="noreferrer" className="text-link">
              Browse fresh repositories
            </a>
          </article>
          <article className="showcase-card secondary">
            <h3>Signature ingredients</h3>
            <ul className="stack-chips">
              <li>Vite</li>
              <li>React</li>
              <li>Godot</li>
              <li>Unity</li>
              <li>Procedural Art</li>
            </ul>
            <p className="card-footnote">Always prototyping with intention and a synthwave soundtrack.</p>
          </article>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="What drives my work"
          title="Focus arenas"
          description="A snapshot of the playgrounds where I prototype, iterate, and obsess over player delight."
        />
        <div className="focus-grid">
          {focusAreas.map((area) => (
            <article key={area.title} className="focus-card">
              <h3>{area.title}</h3>
              <p>{area.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Toolbelt"
          title="Core skills"
          description="Balancing technical systems, visual polish, and collaborative leadership."
        />
        <div className="skills-grid">
          {coreSkills.map((skill) => (
            <article key={skill.category} className="skill-card">
              <h3>{skill.category}</h3>
              <ul>
                {skill.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Home;
