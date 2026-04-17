export type Intent =
  | "gazeta_picture_of_day"
  | "help"
  | "set_voice"
  | "unknown";

export type IntentEntities = {
  source?: "gazeta.ru";
  block?: "picture_of_day";
  voiceName?: string;
};

export type TextPart = {
  text: string;
  format?: "plain" | "markdown";
};

export type SkillInput = {
  userId: string;
  locale: string;
  transcriptText: string;
  intent: Intent;
  entities: IntentEntities;
  traceId: string;
};

export type SkillOutput = {
  messages: TextPart[];
  audioPolicy?: "prefer_voice" | "text_only";
  metadata?: Record<string, string | number | boolean>;
};

export type AsrResult = {
  transcript: string;
};

export type NluResult = {
  intent: Intent;
  entities: IntentEntities;
};

export type PipelineMetrics = {
  asrOk: boolean;
  skillOk: boolean;
  ttsOk: boolean;
  ttsMs?: number;
  skillMs?: number;
  parseEmpty?: boolean;
};
