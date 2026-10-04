// The title block every inner page opens with: a display title, an optional
// light second line, and one sentence.
export function PageHeader({
  title,
  second,
  children,
}: {
  title: string;
  second?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-rule-strong pb-8">
      <h1>
        <span className="display block text-5xl">{title}</span>
        {second && <span className="display-light block text-5xl">{second}</span>}
      </h1>
      {children && <div className="mt-6 max-w-[60ch] text-lg text-muted-foreground">{children}</div>}
    </header>
  );
}
