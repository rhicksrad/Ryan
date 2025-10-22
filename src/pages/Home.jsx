import SectionHeader from '../components/SectionHeader.jsx';
import { coreSkills, focusAreas } from '../data/skills.js';

function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Hi, I'm Ryan.</p>
          <h2>
            I build playful, performant experiences that bridge game feel, creative tooling, and web technology.
          </h2>
          <p>
            From rhythm experiments and AI-assisted story tools to arcade throwbacks, my GitHub is packed with prototypes
            that ship fast without sacrificing craft. I love weaving together art direction, technical chops, and player
            empathy to create memorable interactions.
          </p>
          <div className="hero-ctas">
            <a className="button" href="https://github.com/rhicksrad" target="_blank" rel="noreferrer">
              Explore GitHub
            </a>
            <a
              className="button ghost"
              href="https://www.linkedin.com/in/ryan-hicks-10790a206/"
              target="_blank"
              rel="noreferrer"
            >
              Connect on LinkedIn
            </a>
          </div>
        </div>
        <div className="hero-highlight">
          <div className="highlight-card">
            <p className="metric">Weekend jams → polished builds</p>
            <p>
              Vite + React is my go-to stack for showcasing ideas quickly, backed by years of game design and technical art
              experience across Godot, Unity, and Unreal.
            </p>
          </div>
          <div className="highlight-card">
            <p className="metric">Rapid iteration mindset</p>
            <p>
              I test early, ship often, and build feedback loops directly into my tools—whether it's analytics dashboards
              or in-engine debug overlays.
            </p>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="What drives my work"
          title="Focus areas"
          description="A snapshot of the disciplines I practice across web, game engines, and creative coding."
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
          description="Balanced between technical systems, visual polish, and collaborative leadership."
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
