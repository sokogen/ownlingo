package gemini_test

import (
	"context"
	"testing"

	"github.com/ownlingo/ownlingo/translator/providers/gemini"
)

func TestDefaultConfig(t *testing.T) {
	config := gemini.DefaultConfig("test-api-key")

	if config.APIKey != "test-api-key" {
		t.Errorf("expected API key 'test-api-key', got %q", config.APIKey)
	}

	if config.Model == "" {
		t.Error("expected default model to be set")
	}

	if config.TPM <= 0 {
		t.Error("expected TPM > 0")
	}

	if config.RPM <= 0 {
		t.Error("expected RPM > 0")
	}

	if config.RetryConfig == nil {
		t.Error("expected retry config to be set")
	}
}

func TestNewProvider(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping test that requires API key")
	}

	config := gemini.DefaultConfig("test-api-key")

	// This will fail with invalid API key, but we're just testing it doesn't panic
	provider, err := gemini.NewProvider(context.Background(), config)

	// We expect an error with invalid key, but not a panic
	if err != nil {
		// Invalid API key is expected in tests
		return
	}

	if provider != nil {
		defer provider.Close()

		if provider.Name() != "gemini" {
			t.Errorf("expected provider name 'gemini', got %q", provider.Name())
		}
	}
}

func TestNewProviderNilConfig(t *testing.T) {
	_, err := gemini.NewProvider(context.Background(), nil)
	if err == nil {
		t.Error("expected error when creating provider with nil config")
	}
}
