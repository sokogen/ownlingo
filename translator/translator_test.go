package translator_test

import (
	"testing"

	"github.com/ownlingo/ownlingo/translator"
)

func TestSystemPrompt(t *testing.T) {
	tests := []struct {
		name           string
		preserveHTML   bool
		preserveLiquid bool
		wantContains   []string
	}{
		{
			name:           "basic prompt",
			preserveHTML:   false,
			preserveLiquid: false,
			wantContains:   []string{"professional translator"},
		},
		{
			name:           "with HTML preservation",
			preserveHTML:   true,
			preserveLiquid: false,
			wantContains:   []string{"HTML tags", "unchanged"},
		},
		{
			name:           "with Liquid preservation",
			preserveHTML:   false,
			preserveLiquid: true,
			wantContains:   []string{"Liquid template tags", "unchanged"},
		},
		{
			name:           "with both HTML and Liquid",
			preserveHTML:   true,
			preserveLiquid: true,
			wantContains:   []string{"HTML tags", "Liquid template tags", "unchanged"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prompt := translator.SystemPrompt(tt.preserveHTML, tt.preserveLiquid)

			if prompt == "" {
				t.Fatal("prompt should not be empty")
			}

			for _, want := range tt.wantContains {
				if !contains(prompt, want) {
					t.Errorf("prompt should contain %q, got: %s", want, prompt)
				}
			}
		})
	}
}

func TestTranslationRequest(t *testing.T) {
	req := &translator.TranslationRequest{
		Text:           "Hello, world!",
		SourceLanguage: "en",
		TargetLanguage: "es",
		PreserveHTML:   true,
		PreserveLiquid: false,
	}

	if req.Text != "Hello, world!" {
		t.Errorf("expected text to be 'Hello, world!', got %q", req.Text)
	}

	if req.SourceLanguage != "en" {
		t.Errorf("expected source language to be 'en', got %q", req.SourceLanguage)
	}

	if req.TargetLanguage != "es" {
		t.Errorf("expected target language to be 'es', got %q", req.TargetLanguage)
	}

	if !req.PreserveHTML {
		t.Error("expected PreserveHTML to be true")
	}

	if req.PreserveLiquid {
		t.Error("expected PreserveLiquid to be false")
	}
}

func TestTranslationResponse(t *testing.T) {
	resp := &translator.TranslationResponse{
		TranslatedText: "Hola, mundo!",
		SourceText:     "Hello, world!",
		Provider:       "test-provider",
		TokensUsed: translator.TokenUsage{
			InputTokens:  10,
			OutputTokens: 8,
			TotalTokens:  18,
		},
		Cost: translator.Cost{
			Amount:   0.001,
			Currency: "USD",
		},
	}

	if resp.TranslatedText != "Hola, mundo!" {
		t.Errorf("expected translated text 'Hola, mundo!', got %q", resp.TranslatedText)
	}

	if resp.Provider != "test-provider" {
		t.Errorf("expected provider 'test-provider', got %q", resp.Provider)
	}

	if resp.TokensUsed.TotalTokens != 18 {
		t.Errorf("expected 18 total tokens, got %d", resp.TokensUsed.TotalTokens)
	}

	if resp.Cost.Amount != 0.001 {
		t.Errorf("expected cost 0.001, got %f", resp.Cost.Amount)
	}
}

func TestTokenUsage(t *testing.T) {
	usage := translator.TokenUsage{
		InputTokens:  100,
		OutputTokens: 50,
		TotalTokens:  150,
	}

	if usage.InputTokens != 100 {
		t.Errorf("expected 100 input tokens, got %d", usage.InputTokens)
	}

	if usage.OutputTokens != 50 {
		t.Errorf("expected 50 output tokens, got %d", usage.OutputTokens)
	}

	if usage.TotalTokens != 150 {
		t.Errorf("expected 150 total tokens, got %d", usage.TotalTokens)
	}
}

func TestCost(t *testing.T) {
	cost := translator.Cost{
		Amount:   0.05,
		Currency: "USD",
	}

	if cost.Amount != 0.05 {
		t.Errorf("expected amount 0.05, got %f", cost.Amount)
	}

	if cost.Currency != "USD" {
		t.Errorf("expected currency 'USD', got %q", cost.Currency)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (findSubstring(s, substr) >= 0)
}

func findSubstring(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
