package openai

import (
	"context"
	"fmt"
	"time"

	"github.com/ownlingo/ownlingo/translator"
	"github.com/ownlingo/ownlingo/translator/ratelimit"
	"github.com/ownlingo/ownlingo/translator/retry"
	"github.com/sashabaranov/go-openai"
)

// Provider implements the AITranslator interface for OpenAI
type Provider struct {
	client      *openai.Client
	model       string
	rateLimiter *ratelimit.Limiter
	retryConfig *retry.Config
}

// Config holds OpenAI provider configuration
type Config struct {
	APIKey      string
	Model       string
	TPM         int // Tokens per minute
	RPM         int // Requests per minute
	RetryConfig *retry.Config
}

// DefaultConfig returns default OpenAI configuration
func DefaultConfig(apiKey string) *Config {
	return &Config{
		APIKey:      apiKey,
		Model:       "gpt-4o",
		TPM:         90000,  // GPT-4o default TPM
		RPM:         500,    // GPT-4o default RPM
		RetryConfig: retry.DefaultConfig(),
	}
}

// NewProvider creates a new OpenAI provider
func NewProvider(config *Config) *Provider {
	if config == nil {
		panic("config cannot be nil")
	}

	client := openai.NewClient(config.APIKey)

	return &Provider{
		client:      client,
		model:       config.Model,
		rateLimiter: ratelimit.NewLimiter(config.TPM, config.RPM),
		retryConfig: config.RetryConfig,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "openai"
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
		return nil, fmt.Errorf("openai translate failed: %w", lastErr)
	}

	response.Duration = time.Since(start)
	response.Provider = p.Name()

	return response, nil
}

func (p *Provider) translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	systemPrompt := translator.SystemPrompt(req.PreserveHTML, req.PreserveLiquid)
	userPrompt := fmt.Sprintf("Translate the following text from %s to %s:\n\n%s",
		req.SourceLanguage, req.TargetLanguage, req.Text)

	resp, err := p.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: p.model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: systemPrompt,
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: userPrompt,
			},
		},
	})

	if err != nil {
		// Check if error is retryable (429 or 500)
		if isRetryableError(err) {
			return nil, &retry.RetryableError{Err: err}
		}
		return nil, err
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned from OpenAI")
	}

	translatedText := resp.Choices[0].Message.Content

	// Calculate cost (approximate)
	cost := calculateCost(p.model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens)

	return &translator.TranslationResponse{
		TranslatedText: translatedText,
		SourceText:     req.Text,
		TokensUsed: translator.TokenUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
			TotalTokens:  resp.Usage.TotalTokens,
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
	// This is a simplified check - in production, you'd parse the actual error
	errStr := err.Error()
	return contains(errStr, "429") || contains(errStr, "500") || contains(errStr, "503")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) &&
		(hasPrefix(s, substr) || hasSuffix(s, substr) || hasInfix(s, substr)))
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func hasSuffix(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}

func hasInfix(s, infix string) bool {
	for i := 0; i <= len(s)-len(infix); i++ {
		if s[i:i+len(infix)] == infix {
			return true
		}
	}
	return false
}

// calculateCost calculates the cost based on token usage
// Prices are approximate and should be updated based on current OpenAI pricing
func calculateCost(model string, inputTokens, outputTokens int) float64 {
	var inputPrice, outputPrice float64

	switch model {
	case "gpt-4o":
		inputPrice = 0.005 / 1000   // $0.005 per 1K input tokens
		outputPrice = 0.015 / 1000  // $0.015 per 1K output tokens
	case "gpt-4":
		inputPrice = 0.03 / 1000    // $0.03 per 1K input tokens
		outputPrice = 0.06 / 1000   // $0.06 per 1K output tokens
	default:
		inputPrice = 0.005 / 1000
		outputPrice = 0.015 / 1000
	}

	return float64(inputTokens)*inputPrice + float64(outputTokens)*outputPrice
}
