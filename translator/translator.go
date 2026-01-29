package translator

import (
	"context"
	"time"
)

// AITranslator defines the interface for AI translation providers
type AITranslator interface {
	// Translate translates a single text from source language to target language
	Translate(ctx context.Context, req *TranslationRequest) (*TranslationResponse, error)

	// TranslateBatch translates multiple texts in a single request
	TranslateBatch(ctx context.Context, reqs []*TranslationRequest) ([]*TranslationResponse, error)

	// Name returns the provider name
	Name() string
}

// TranslationRequest represents a translation request
type TranslationRequest struct {
	Text           string
	SourceLanguage string
	TargetLanguage string
	PreserveHTML   bool // Preserve HTML/Liquid tags
	PreserveLiquid bool
}

// TranslationResponse represents a translation response
type TranslationResponse struct {
	TranslatedText string
	SourceText     string
	TokensUsed     TokenUsage
	Cost           Cost
	Provider       string
	Duration       time.Duration
}

// TokenUsage tracks token consumption
type TokenUsage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
}

// Cost tracks the cost of the translation
type Cost struct {
	Amount   float64
	Currency string
}

// SystemPrompt returns the translation system prompt that preserves HTML/Liquid tags
func SystemPrompt(preserveHTML, preserveLiquid bool) string {
	prompt := "You are a professional translator. Translate the provided text accurately while maintaining the original meaning, tone, and style."

	if preserveHTML || preserveLiquid {
		prompt += "\n\nIMPORTANT: The text contains markup tags that must be preserved EXACTLY as they appear:"
	}

	if preserveHTML {
		prompt += "\n- HTML tags (e.g., <div>, <span>, <a href=\"...\">) must remain unchanged"
	}

	if preserveLiquid {
		prompt += "\n- Liquid template tags (e.g., {{ variable }}, {% if condition %}) must remain unchanged"
	}

	if preserveHTML || preserveLiquid {
		prompt += "\n\nOnly translate the human-readable text between and outside these tags. Do not translate tag names, attributes, or template variables."
	}

	return prompt
}
