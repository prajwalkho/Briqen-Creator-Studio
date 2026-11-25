import { GoogleGenAI } from '@google/genai';

let _aiClient: GoogleGenAI | null = null;

export function hasGeminiApiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 10);
}

export function getAiClient(): GoogleGenAI {
  if (!hasGeminiApiKey()) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your API key in Settings > Secrets or use the Mock provider for local testing.'
    );
  }
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _aiClient;
}
