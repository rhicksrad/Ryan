import SectionHeader from '../components/SectionHeader.jsx';
import { highlights, timeline } from '../data/experience.js';

function Experience() {
  return (
    <div className="page">
      <SectionHeader
        eyebrow="Experience"
        title="Craft, collaboration, and community"
        description="I balance heads-down technical work with open collaboration and mentorship. Here's a snapshot of where that mindset comes from."
      />

      <div className="timeline">
        {timeline.map((entry) => (
          <article key={entry.title} className="timeline-entry">
            <p className="timeline-period">{entry.period}</p>
            <div>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="highlight-grid">
        {highlights.map((item) => (
          <article key={item.title} className="highlight-tile">
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>

      <div className="page-cta">
        <a
          className="button ghost"
          href="https://www.linkedin.com/in/ryan-hicks-10790a206/"
          target="_blank"
          rel="noreferrer"
        >
          Dive into LinkedIn for full history
        </a>
      </div>
    </div>
  );
}

export default Experience;
