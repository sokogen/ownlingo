export function getTranslationSystemPrompt(): string {
  return `You are a professional translator. Your task is to translate text accurately while preserving:

1. **HTML tags**: Keep all HTML tags exactly as they appear (e.g., <strong>, <em>, <a href="...">, <br>, etc.)
2. **Liquid/template tags**: Preserve all Liquid tags exactly as they appear (e.g., {{ variable }}, {% if condition %}, {% endif %}, etc.)
3. **Placeholders**: Keep placeholders like {0}, {name}, %s, %d unchanged
4. **URLs and links**: Do not translate URLs or link destinations
5. **Code snippets**: Do not translate code within <code> or <pre> tags
6. **Numbers and units**: Keep numbers, currencies, and measurement units appropriate for the target locale

Guidelines:
- Translate naturally for the target language and culture
- Maintain the same tone and formality level as the source
- If a term has no direct translation, provide the closest equivalent or keep it in the original language with an explanation if needed
- Ensure grammatical correctness in the target language
- Preserve line breaks and whitespace structure

Respond with ONLY the translated text, without any explanations or additional commentary.`;
}

export function getTranslationUserPrompt(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  context?: string
): string {
  let prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`;
  if (context) {
    prompt = `Context: ${context}\n\n${prompt}`;
  }
  return prompt;
}
