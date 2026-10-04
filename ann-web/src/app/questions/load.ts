import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { QuestionView } from "./QuestionItem";

export async function loadQuestions(where: Prisma.ViewerQuestionWhereInput, take = 30, withHandle = false): Promise<QuestionView[]> {
  const rows = await prisma.viewerQuestion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { handle: true } } },
  });
  const ids = [...new Set(rows.flatMap((r) => r.articleIds))];
  const stories = ids.length
    ? await prisma.article.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, source: true } })
    : [];
  const byId = new Map(stories.map((s) => [s.id, s]));
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    status: r.status,
    reason: r.reason,
    answer: r.answer,
    createdAt: r.createdAt,
    handle: withHandle ? r.user.handle : undefined,
    stories: r.articleIds.map((id) => byId.get(id)).filter((s) => s !== undefined),
  }));
}
