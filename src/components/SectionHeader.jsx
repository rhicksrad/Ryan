function SectionHeader({ eyebrow, title, description }) {
  return (
    <header className="section-header">
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      <h2 className="section-title">{title}</h2>
      {description && <p className="section-description">{description}</p>}
    </header>
  );
}

export default SectionHeader;
