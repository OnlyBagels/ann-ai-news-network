import type { Metadata } from "next";
import { FeedList } from "@/components/feed/FeedList";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Latest",
  description: "Every published ANN story, newest first.",
};

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Latest">Every published story, newest first.</PageHeader>
      <FeedList />
    </div>
  );
}
