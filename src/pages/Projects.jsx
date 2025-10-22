import SectionHeader from '../components/SectionHeader.jsx';
import RepoGrid from '../components/RepoGrid.jsx';
import { site } from '../data/site.js';

function Projects() {
  return (
    <div className="page projects-page">
      <SectionHeader
        eyebrow="Interactive work"
        title="Latest experiments"
        description="Automatically pulled from my GitHub profile. These repos capture the prototypes, tools, and playful ideas I'm iterating on right now."
      />
      <RepoGrid />
      <div className="page-cta">
        <a className="button" href={site.githubProjects} target="_blank" rel="noreferrer">
          View all repositories
        </a>
      </div>
    </div>
  );
}

export default Projects;
