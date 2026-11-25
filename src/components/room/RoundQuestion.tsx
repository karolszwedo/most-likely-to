import { contentLang, foreignLang, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/react";
import { questionSentence } from "@/lib/rooms/shared";

// The round's question as the heading of the voting and the reveal. The text comes from the Worker as plain text, the
// ending after "Kto z nas najprawdopodobniej" or "Who’s most likely to" (src/lib/rooms/shared.ts, RoundView), and React
// renders it as text, never as HTML (lessons.md).
interface Props {
  question: string | null;
  // The language the text is in (RoundView.questionLang).
  questionLang: Lang;
  titleAs: "h1" | "h2";
}

export function RoundQuestion({ question, questionLang, titleAs: Title }: Props) {
  // The sentence in the language of the question's text (plan, "Język treści pytania"), which a screen reader reads in
  // it when it is not the screen's.
  const screen = useLang();
  const lang = contentLang(questionLang, screen);
  return (
    <Title lang={foreignLang(lang, screen)} className="text-2xl font-semibold text-balance break-words">
      {questionSentence(question, lang)}
    </Title>
  );
}
