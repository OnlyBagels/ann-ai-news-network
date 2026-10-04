import Link from "next/link";

export default function NotFound() {
  return (
    <div className="border-b border-rule-strong pb-12">
      <h1>
        <span className="display block text-5xl">Not on</span>
        <span className="display-light block text-5xl">the wire</span>
      </h1>
      <p className="mt-6 max-w-[60ch] text-lg text-muted-foreground">
        This page doesn&rsquo;t exist, or the story hasn&rsquo;t been published. Stories still waiting for review
        aren&rsquo;t public.
      </p>
      <p className="mt-8">
        <Link href="/feed" className="button">
          See the latest stories
        </Link>
      </p>
    </div>
  );
}
