package fallback

import (
	"context"
	"fmt"

	"github.com/ownlingo/ownlingo/translator"
)

// Chain implements a fallback chain of AI translators
type Chain struct {
	providers []translator.AITranslator
}

// NewChain creates a new fallback chain with the given providers
// Providers are tried in order: primary → secondary → tertiary → ...
func NewChain(providers ...translator.AITranslator) *Chain {
	if len(providers) == 0 {
		panic("at least one provider is required")
	}

	return &Chain{
		providers: providers,
	}
}

// Name returns the name of the chain (primary provider name)
func (c *Chain) Name() string {
	return fmt.Sprintf("fallback-chain(%s)", c.providers[0].Name())
}

// Translate attempts translation with fallback to secondary providers on failure
func (c *Chain) Translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	var lastErr error

	for i, provider := range c.providers {
		resp, err := provider.Translate(ctx, req)
		if err == nil {
			return resp, nil
		}

		lastErr = fmt.Errorf("provider %s (%d/%d) failed: %w",
			provider.Name(), i+1, len(c.providers), err)

		// If this is not the last provider, continue to next
		if i < len(c.providers)-1 {
			continue
		}
	}

	return nil, fmt.Errorf("all providers failed, last error: %w", lastErr)
}

// TranslateBatch translates multiple texts with fallback support
func (c *Chain) TranslateBatch(ctx context.Context, reqs []*translator.TranslationRequest) ([]*translator.TranslationResponse, error) {
	var lastErr error

	for i, provider := range c.providers {
		responses, err := provider.TranslateBatch(ctx, reqs)
		if err == nil {
			return responses, nil
		}

		lastErr = fmt.Errorf("provider %s (%d/%d) failed: %w",
			provider.Name(), i+1, len(c.providers), err)

		// If this is not the last provider, continue to next
		if i < len(c.providers)-1 {
			continue
		}
	}

	return nil, fmt.Errorf("all providers failed for batch, last error: %w", lastErr)
}
