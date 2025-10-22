import SectionHeader from '../components/SectionHeader.jsx';

function Contact() {
  return (
    <div className="page">
      <SectionHeader
        eyebrow="Let's build something"
        title="Get in touch"
        description="I'm always excited to collaborate on experimental interfaces, rapid prototypes, or systems design challenges."
      />

      <div className="contact-card">
        <p>
          The fastest way to reach me is through LinkedIn or GitHub. If you're interested in contracting, consulting, or
          hosting a workshop, send a message with a short brief and I'll respond within two business days.
        </p>
        <div className="contact-actions">
          <a className="button" href="mailto:ryan@ryansradical.games">
            Email Ryan
          </a>
          <a className="button ghost" href="https://github.com/rhicksrad" target="_blank" rel="noreferrer">
            Follow on GitHub
          </a>
          <a
            className="button ghost"
            href="https://www.linkedin.com/in/ryan-hicks-10790a206/"
            target="_blank"
            rel="noreferrer"
          >
            Message on LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}

export default Contact;
