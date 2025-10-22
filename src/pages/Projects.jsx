import SectionHeader from '../components/SectionHeader.jsx';
import RepoGrid from '../components/RepoGrid.jsx';

function Projects() {
  return (
    <div className="page">
      <SectionHeader
        eyebrow="Interactive work"
        title="Latest experiments"
        description="Automatically pulled from my GitHub profile. These repos capture the prototypes, tools, and playful ideas I'm iterating on right now."
      />
      <RepoGrid />
      <div className="page-cta">
        <a className="button" href="https://github.com/rhicksrad?tab=repositories" target="_blank" rel="noreferrer">
          View all repositories
        </a>
      </div>
    </div>
  );
}

export default Projects;
