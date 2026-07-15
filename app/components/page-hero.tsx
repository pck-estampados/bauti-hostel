type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  aside?: string;
};

export function PageHero({ eyebrow, title, description, aside }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="shell page-hero__inner">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {aside ? <span className="page-hero__aside">{aside}</span> : null}
      </div>
    </section>
  );
}
