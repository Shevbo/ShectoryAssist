import type { SkillInput, SkillOutput } from "./types.js";

export type SkillHandler = (input: SkillInput) => Promise<SkillOutput>;

export type SkillRegistry = Record<string, SkillHandler>;
