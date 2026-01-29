package anthropic_test

import (
	"testing"

	"github.com/ownlingo/ownlingo/translator/providers/anthropic"
)

func TestDefaultConfig(t *testing.T) {
	config := anthropic.DefaultConfig("test-api-key")

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
	config := anthropic.DefaultConfig("test-api-key")
	provider := anthropic.NewProvider(config)

	if provider == nil {
		t.Fatal("expected provider to be created")
	}

	if provider.Name() != "anthropic" {
		t.Errorf("expected provider name 'anthropic', got %q", provider.Name())
	}
}

func TestNewProviderPanic(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic when creating provider with nil config")
		}
	}()

	anthropic.NewProvider(nil)
}
