import type { UserProfileStore } from "@shectory-assist/core";

export class MemoryProfileStore implements UserProfileStore {
  private readonly voices = new Map<string, string>();

  constructor(private readonly defaultVoice: string) {}

  async getVoice(userId: string): Promise<string> {
    return this.voices.get(userId) ?? this.defaultVoice;
  }

  async setVoice(userId: string, voice: string): Promise<void> {
    this.voices.set(userId, voice);
  }
}
