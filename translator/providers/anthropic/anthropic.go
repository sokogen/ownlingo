package anthropic

import (
	"context"
	"fmt"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/ownlingo/ownlingo/translator"
	"github.com/ownlingo/ownlingo/translator/ratelimit"
	"github.com/ownlingo/ownlingo/translator/retry"
)

// Provider implements the AITranslator interface for Anthropic
type Provider struct {
	client      anthropic.Client
	model       string
	rateLimiter *ratelimit.Limiter
	retryConfig *retry.Config
}

// Config holds Anthropic provider configuration
type Config struct {
	APIKey      string
	Model       string
	TPM         int // Tokens per minute
	RPM         int // Requests per minute
	RetryConfig *retry.Config
}

// DefaultConfig returns default Anthropic configuration
func DefaultConfig(apiKey string) *Config {
	return &Config{
		APIKey:      apiKey,
		Model:       "claude-sonnet-4-20250514",
		TPM:         80000,  // Claude Sonnet default TPM
		RPM:         50,     // Claude Sonnet default RPM
		RetryConfig: retry.DefaultConfig(),
	}
}

// NewProvider creates a new Anthropic provider
func NewProvider(config *Config) *Provider {
	if config == nil {
		panic("config cannot be nil")
	}

	client := anthropic.NewClient(option.WithAPIKey(config.APIKey))

	return &Provider{
		client:      client,
		model:       config.Model,
		rateLimiter: ratelimit.NewLimiter(config.TPM, config.RPM),
		retryConfig: config.RetryConfig,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "anthropic"
}

// Translate translates a single text
func (p *Provider) Translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	start := time.Now()

	var response *translator.TranslationResponse
	var lastErr error

	// Retry with exponential backoff
	err := retry.Do(ctx, p.retryConfig, func() error {
		// Estimate tokens needed (rough estimate: 1 token ~= 4 chars)
		estimatedTokens := len(req.Text) / 4
		if estimatedTokens < 100 {
			estimatedTokens = 100 // Minimum estimate
		}

		// Wait for rate limit
		if err := p.rateLimiter.Wait(ctx, estimatedTokens); err != nil {
			return err
		}

		// Make API call
		resp, err := p.translate(ctx, req)
		if err != nil {
			lastErr = err
			return err
		}

		response = resp
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("anthropic translate failed: %w", lastErr)
	}

	response.Duration = time.Since(start)
	response.Provider = p.Name()

	return response, nil
}

func (p *Provider) translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	systemPrompt := translator.SystemPrompt(req.PreserveHTML, req.PreserveLiquid)

	// Combine system prompt with user request since SDK typing is complex
	fullPrompt := fmt.Sprintf("%s\n\nTranslate the following text from %s to %s:\n\n%s",
		systemPrompt, req.SourceLanguage, req.TargetLanguage, req.Text)

	message, err := p.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(p.model),
		MaxTokens: 4096,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(fullPrompt)),
		},
	})

	if err != nil {
		// Check if error is retryable (429 or 500)
		if isRetryableError(err) {
			return nil, &retry.RetryableError{Err: err}
		}
		return nil, err
	}

	if len(message.Content) == 0 {
		return nil, fmt.Errorf("no content returned from Anthropic")
	}

	translatedText := message.Content[0].Text

	// Calculate cost (approximate)
	cost := calculateCost(p.model, int(message.Usage.InputTokens), int(message.Usage.OutputTokens))

	return &translator.TranslationResponse{
		TranslatedText: translatedText,
		SourceText:     req.Text,
		TokensUsed: translator.TokenUsage{
			InputTokens:  int(message.Usage.InputTokens),
			OutputTokens: int(message.Usage.OutputTokens),
			TotalTokens:  int(message.Usage.InputTokens + message.Usage.OutputTokens),
		},
		Cost: translator.Cost{
			Amount:   cost,
			Currency: "USD",
		},
	}, nil
}

// TranslateBatch translates multiple texts
func (p *Provider) TranslateBatch(ctx context.Context, reqs []*translator.TranslationRequest) ([]*translator.TranslationResponse, error) {
	responses := make([]*translator.TranslationResponse, len(reqs))

	for i, req := range reqs {
		resp, err := p.Translate(ctx, req)
		if err != nil {
			return nil, fmt.Errorf("batch translate failed at index %d: %w", i, err)
		}
		responses[i] = resp
	}

	return responses, nil
}

func isRetryableError(err error) bool {
	// Check for rate limit or server errors
	errStr := err.Error()
	return contains(errStr, "429") || contains(errStr, "500") || contains(errStr, "503") ||
		contains(errStr, "overloaded")
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// calculateCost calculates the cost based on token usage
// Prices are approximate and should be updated based on current Anthropic pricing
func calculateCost(model string, inputTokens, outputTokens int) float64 {
	var inputPrice, outputPrice float64

	switch {
	case contains(model, "claude-sonnet-4"):
		inputPrice = 0.003 / 1000   // $0.003 per 1K input tokens
		outputPrice = 0.015 / 1000  // $0.015 per 1K output tokens
	case contains(model, "claude-opus"):
		inputPrice = 0.015 / 1000   // $0.015 per 1K input tokens
		outputPrice = 0.075 / 1000  // $0.075 per 1K output tokens
	default:
		inputPrice = 0.003 / 1000
		outputPrice = 0.015 / 1000
	}

	return float64(inputTokens)*inputPrice + float64(outputTokens)*outputPrice
}
