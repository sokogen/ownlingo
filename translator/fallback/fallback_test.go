package fallback_test

import (
	"context"
	"errors"
	"testing"

	"github.com/ownlingo/ownlingo/translator"
	"github.com/ownlingo/ownlingo/translator/fallback"
)

// Mock translator for testing
type mockTranslator struct {
	name      string
	shouldErr bool
	errMsg    string
}

func (m *mockTranslator) Name() string {
	return m.name
}

func (m *mockTranslator) Translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	if m.shouldErr {
		return nil, errors.New(m.errMsg)
	}

	return &translator.TranslationResponse{
		TranslatedText: "translated: " + req.Text,
		SourceText:     req.Text,
		Provider:       m.name,
	}, nil
}

func (m *mockTranslator) TranslateBatch(ctx context.Context, reqs []*translator.TranslationRequest) ([]*translator.TranslationResponse, error) {
	if m.shouldErr {
		return nil, errors.New(m.errMsg)
	}

	responses := make([]*translator.TranslationResponse, len(reqs))
	for i, req := range reqs {
		responses[i] = &translator.TranslationResponse{
			TranslatedText: "translated: " + req.Text,
			SourceText:     req.Text,
			Provider:       m.name,
		}
	}

	return responses, nil
}

func TestNewChain(t *testing.T) {
	provider1 := &mockTranslator{name: "provider1"}
	provider2 := &mockTranslator{name: "provider2"}

	chain := fallback.NewChain(provider1, provider2)
	if chain == nil {
		t.Fatal("expected chain to be created")
	}

	if !contains(chain.Name(), "provider1") {
		t.Errorf("expected chain name to contain 'provider1', got %q", chain.Name())
	}
}

func TestNewChainPanic(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic when creating chain with no providers")
		}
	}()

	fallback.NewChain()
}

func TestChainTranslateSuccess(t *testing.T) {
	provider := &mockTranslator{name: "test-provider"}
	chain := fallback.NewChain(provider)

	req := &translator.TranslationRequest{
		Text:           "Hello",
		SourceLanguage: "en",
		TargetLanguage: "es",
	}

	resp, err := chain.Translate(context.Background(), req)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if resp.Provider != "test-provider" {
		t.Errorf("expected provider 'test-provider', got %q", resp.Provider)
	}

	if resp.TranslatedText != "translated: Hello" {
		t.Errorf("unexpected translation: %q", resp.TranslatedText)
	}
}

func TestChainTranslateFallback(t *testing.T) {
	provider1 := &mockTranslator{
		name:      "provider1",
		shouldErr: true,
		errMsg:    "provider1 error",
	}
	provider2 := &mockTranslator{
		name: "provider2",
	}
	provider3 := &mockTranslator{
		name: "provider3",
	}

	chain := fallback.NewChain(provider1, provider2, provider3)

	req := &translator.TranslationRequest{
		Text:           "Hello",
		SourceLanguage: "en",
		TargetLanguage: "es",
	}

	resp, err := chain.Translate(context.Background(), req)
	if err != nil {
		t.Fatalf("expected no error after fallback, got %v", err)
	}

	// Should use provider2 since provider1 failed
	if resp.Provider != "provider2" {
		t.Errorf("expected provider 'provider2', got %q", resp.Provider)
	}
}

func TestChainTranslateAllFail(t *testing.T) {
	provider1 := &mockTranslator{
		name:      "provider1",
		shouldErr: true,
		errMsg:    "error1",
	}
	provider2 := &mockTranslator{
		name:      "provider2",
		shouldErr: true,
		errMsg:    "error2",
	}

	chain := fallback.NewChain(provider1, provider2)

	req := &translator.TranslationRequest{
		Text:           "Hello",
		SourceLanguage: "en",
		TargetLanguage: "es",
	}

	_, err := chain.Translate(context.Background(), req)
	if err == nil {
		t.Fatal("expected error when all providers fail")
	}

	if !contains(err.Error(), "all providers failed") {
		t.Errorf("expected 'all providers failed' in error, got: %v", err)
	}
}

func TestChainTranslateBatchSuccess(t *testing.T) {
	provider := &mockTranslator{name: "test-provider"}
	chain := fallback.NewChain(provider)

	reqs := []*translator.TranslationRequest{
		{Text: "Hello", SourceLanguage: "en", TargetLanguage: "es"},
		{Text: "World", SourceLanguage: "en", TargetLanguage: "es"},
	}

	responses, err := chain.TranslateBatch(context.Background(), reqs)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(responses) != 2 {
		t.Fatalf("expected 2 responses, got %d", len(responses))
	}

	for i, resp := range responses {
		if resp.Provider != "test-provider" {
			t.Errorf("response %d: expected provider 'test-provider', got %q", i, resp.Provider)
		}
	}
}

func TestChainTranslateBatchFallback(t *testing.T) {
	provider1 := &mockTranslator{
		name:      "provider1",
		shouldErr: true,
		errMsg:    "batch error",
	}
	provider2 := &mockTranslator{
		name: "provider2",
	}

	chain := fallback.NewChain(provider1, provider2)

	reqs := []*translator.TranslationRequest{
		{Text: "Hello", SourceLanguage: "en", TargetLanguage: "es"},
	}

	responses, err := chain.TranslateBatch(context.Background(), reqs)
	if err != nil {
		t.Fatalf("expected no error after fallback, got %v", err)
	}

	if responses[0].Provider != "provider2" {
		t.Errorf("expected provider 'provider2', got %q", responses[0].Provider)
	}
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
