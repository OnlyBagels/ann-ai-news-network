// Body text for long-form pages: the legal pages and the AI disclosure.
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-4 text-lg leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-rule-strong [&_a]:underline-offset-4 [&_a:hover]:text-brand [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:pl-2 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-6 [&_strong]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6">
      {children}
    </div>
  );
}
