/**
 * services/worker/src/gemini.ts — Google Gemini calls (WS-C, plan §1.2).
 *
 * Server-side only (the API key never ships to the app). Model id is
 * env-configurable (`GEMINI_MODEL`, default `gemini-2.5-flash` — a free-tier
 * friendly default, deliberately not hardcoded since model availability
 * changes). Korean-only output is enforced in the system prompt for both the
 * `generate` and `clarify` (plan §2.2) paths. Genre/tone steer the prompt
 * using the Korean label maps from `@daytale/shared` so the prompt uses
 * natural Korean genre/tone names, not raw enum keys.
 *
 * Uses `models.generateContentStream(...)` (plan §1.2 "streaming to avoid
 * HTTP timeouts") rather than a plain non-streaming call, and
 * `responseMimeType: "application/json"` to ask Gemini for raw JSON directly
 * (the fenced-code-block fallback in `extractJsonPayload` still guards
 * against models that ignore that hint).
 */

import { GoogleGenAI } from "@google/genai";
import {
  GENRE_LABEL_KO,
  TONE_LABEL_KO,
  type ClarifyingAnswer,
  type ClarifyingQuestion,
  type DiaryEntryRow,
  type GenreCode,
  type ToneCode,
} from "@daytale/shared";

const DEFAULT_MODEL = "gemini-2.5-flash";

let genAIClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (genAIClient) return genAIClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[worker] GEMINI_API_KEY must be set — see root .env.example");
  }
  genAIClient = new GoogleGenAI({ apiKey });
  return genAIClient;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * `GEMINI_EFFORT` (free-form knob, mirrors the old `ANTHROPIC_EFFORT`) is
 * approximated via the `maxOutputTokens` budget. `GEMINI_THINKING=off`
 * disables Gemini 2.5's dynamic thinking (`thinkingBudget: 0`); any other
 * value (default `adaptive`) leaves the model's own dynamic budget in place.
 */
function getGenerationConfig(): {
  maxOutputTokens: number;
  thinkingConfig?: { thinkingBudget: number };
} {
  const effort = (process.env.GEMINI_EFFORT ?? "high").trim().toLowerCase();
  const maxOutputTokens = effort === "low" ? 2048 : effort === "medium" ? 4096 : 8192;

  const thinking = (process.env.GEMINI_THINKING ?? "adaptive").trim().toLowerCase();
  if (thinking === "off" || thinking === "none") {
    return { maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } };
  }
  return { maxOutputTokens };
}

type DiaryEntryForPrompt = Pick<DiaryEntryRow, "entry_date" | "text">;

function formatDiaryEntries(entries: DiaryEntryForPrompt[]): string {
  return entries
    .map((entry, i) => `[${i + 1}번째 일기 - ${entry.entry_date}]\n${entry.text}`)
    .join("\n\n");
}

// =============================================================================
// mode='generate' (plan §2.1 step 3)
// =============================================================================

export interface GenerateEpisodeInput {
  diaryEntries: DiaryEntryForPrompt[];
  genre: GenreCode;
  tone: ToneCode;
  batchLabel: string | null;
  clarifyingQuestions?: ClarifyingQuestion[] | null;
  clarifyingAnswers?: ClarifyingAnswer[] | null;
}

export interface GeneratedEpisode {
  title: string;
  content: string;
}

const GENERATE_SYSTEM_PROMPT = `당신은 사용자의 개인 일기를 소재로, 계속 이어지는 개인 연재 소설의 한 화(episode)를 써주는 소설 작가 AI입니다.

규칙:
- 반드시 한국어로만 작성하세요. 영어 등 다른 언어 단어를 섞지 마세요.
- 일기 속 실제 사건과 감정을 존중하되, 소설적으로 각색하여 하나의 완결된 에피소드로 재구성하세요.
- 지정된 장르와 톤을 분명히 반영하세요.
- 여러 날짜의 일기가 주어지면, 하나의 자연스러운 이야기 흐름으로 엮으세요.
- 사용자가 답한 보충 설명(있다면)을 이야기에 반영하세요.
- 결과는 반드시 아래의 JSON 객체 하나만 반환하세요. 다른 설명, 인사말, 마크다운, 코드블록 없이 순수 JSON만 출력하세요:
{"title": "에피소드 제목", "content": "에피소드 본문"}`;

function buildGenerateUserPrompt(input: GenerateEpisodeInput): string {
  const genreLabel = GENRE_LABEL_KO[input.genre];
  const toneLabel = TONE_LABEL_KO[input.tone];

  const parts: string[] = [
    `장르: ${genreLabel}`,
    `톤: ${toneLabel}`,
  ];
  if (input.batchLabel) {
    parts.push(`묶음 제목(참고용): ${input.batchLabel}`);
  }

  parts.push("", "--- 원본 일기 ---", formatDiaryEntries(input.diaryEntries));

  if (input.clarifyingQuestions?.length) {
    const qa = input.clarifyingQuestions
      .map((q) => {
        const answer = input.clarifyingAnswers?.find((a) => a.question_id === q.id);
        return `Q. ${q.question_ko}\nA. ${answer?.answer_ko ?? "(답변 없음)"}`;
      })
      .join("\n\n");
    parts.push("", "--- 사용자 보충 설명 ---", qa);
  }

  return parts.join("\n");
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseGeneratedEpisode(raw: string): GeneratedEpisode {
  const jsonText = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `[worker] Gemini generate response was not valid JSON: ${(err as Error).message}`
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).title !== "string" ||
    typeof (parsed as Record<string, unknown>).content !== "string"
  ) {
    throw new Error(
      "[worker] Gemini generate response JSON missing required string fields title/content"
    );
  }

  const { title, content } = parsed as { title: string; content: string };
  return { title: title.trim(), content: content.trim() };
}

async function collectStreamText(
  stream: AsyncGenerator<{ text?: string }>
): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk.text ?? "";
  }
  return text;
}

export async function generateEpisode(
  input: GenerateEpisodeInput
): Promise<GeneratedEpisode> {
  const client = getGenAIClient();
  const userPrompt = buildGenerateUserPrompt(input);
  const { maxOutputTokens, thinkingConfig } = getGenerationConfig();

  const stream = await client.models.generateContentStream({
    model: getModel(),
    contents: userPrompt,
    config: {
      systemInstruction: GENERATE_SYSTEM_PROMPT,
      maxOutputTokens,
      responseMimeType: "application/json",
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  });

  const text = await collectStreamText(stream);
  return parseGeneratedEpisode(text);
}

// =============================================================================
// mode='clarify' (plan §2.2)
// =============================================================================

export interface ClarifyInput {
  diaryEntries: DiaryEntryForPrompt[];
  genre: GenreCode;
  tone: ToneCode;
  batchLabel: string | null;
}

const CLARIFY_SYSTEM_PROMPT = `당신은 사용자의 일기를 바탕으로 소설을 쓰기 전에, 이야기를 더 풍부하게 만들기 위해 부족한 정보를 확인하는 보조 작가 AI입니다.

규칙:
- 반드시 한국어로만 질문하세요.
- 일기 내용을 읽고, 소설로 각색하는 데 도움이 될 만한 구체적인 질문을 최대 3개까지 만드세요.
- 이미 일기에 충분히 드러난 내용은 다시 묻지 마세요. 질문이 필요 없다면 빈 배열을 반환하세요.
- 결과는 반드시 아래 형식의 JSON 배열 하나만 반환하세요. 다른 설명, 마크다운, 코드블록 없이 순수 JSON만 출력하세요:
[{"id": "q1", "question_ko": "..."}, {"id": "q2", "question_ko": "..."}]`;

function buildClarifyUserPrompt(input: ClarifyInput): string {
  const genreLabel = GENRE_LABEL_KO[input.genre];
  const toneLabel = TONE_LABEL_KO[input.tone];

  return [
    `장르: ${genreLabel}`,
    `톤: ${toneLabel}`,
    "",
    "--- 원본 일기 ---",
    formatDiaryEntries(input.diaryEntries),
  ].join("\n");
}

function parseClarifyingQuestions(raw: string): ClarifyingQuestion[] {
  const jsonText = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `[worker] Gemini clarify response was not valid JSON: ${(err as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("[worker] Gemini clarify response JSON was not an array");
  }

  const questions: ClarifyingQuestion[] = parsed
    .filter(
      (item): item is { id: string; question_ko: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).question_ko === "string" &&
        (item as Record<string, string>).question_ko.length > 0
    )
    .map((item) => ({ id: item.id, question_ko: item.question_ko }));

  return questions.slice(0, 3);
}

export async function generateClarifyingQuestions(
  input: ClarifyInput
): Promise<ClarifyingQuestion[]> {
  const client = getGenAIClient();
  const userPrompt = buildClarifyUserPrompt(input);

  const stream = await client.models.generateContentStream({
    model: getModel(),
    contents: userPrompt,
    config: {
      systemInstruction: CLARIFY_SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const text = await collectStreamText(stream);
  return parseClarifyingQuestions(text);
}
