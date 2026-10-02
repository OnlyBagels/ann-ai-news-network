import Link from "next/link";

export function AuthForm({
  action,
  submit,
  passwordHint,
  autoComplete,
  alt,
}: {
  action: (formData: FormData) => Promise<void>;
  submit: string;
  passwordHint?: string;
  autoComplete: "current-password" | "new-password";
  alt: { href: string; text: string };
}) {
  return (
    <form action={action} className="flex max-w-[480px] flex-col gap-4">
      <label htmlFor="handle" className="label text-muted-foreground">
        Handle
      </label>
      <input id="handle" name="handle" required autoComplete="username" placeholder="pixelfan" className="field" />
      <label htmlFor="password" className="label text-muted-foreground">
        Password{passwordHint ? ` (${passwordHint})` : ""}
      </label>
      <input id="password" name="password" type="password" required autoComplete={autoComplete} className="field" />
      <button type="submit" className="button">
        {submit}
      </button>
      <p className="text-muted-foreground">
        <Link href={alt.href} className="link">
          {alt.text}
        </Link>
      </p>
    </form>
  );
}
