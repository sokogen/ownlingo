package gemini

import (
	"context"
	"fmt"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/ownlingo/ownlingo/translator"
	"github.com/ownlingo/ownlingo/translator/ratelimit"
	"github.com/ownlingo/ownlingo/translator/retry"
	"google.golang.org/api/option"
)

// Provider implements the AITranslator interface for Google Gemini
type Provider struct {
	client      *genai.Client
	model       *genai.GenerativeModel
	modelName   string
	rateLimiter *ratelimit.Limiter
	retryConfig *retry.Config
}

// Config holds Gemini provider configuration
type Config struct {
	APIKey      string
	Model       string
	TPM         int // Tokens per minute
	RPM         int // Requests per minute
	RetryConfig *retry.Config
}

// DefaultConfig returns default Gemini configuration
func DefaultConfig(apiKey string) *Config {
	return &Config{
		APIKey:      apiKey,
		Model:       "gemini-1.5-pro",
		TPM:         32000,  // Gemini default TPM
		RPM:         60,     // Gemini default RPM
		RetryConfig: retry.DefaultConfig(),
	}
}

// NewProvider creates a new Gemini provider
func NewProvider(ctx context.Context, config *Config) (*Provider, error) {
	if config == nil {
		return nil, fmt.Errorf("config cannot be nil")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(config.APIKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	model := client.GenerativeModel(config.Model)

	return &Provider{
		client:      client,
		model:       model,
		modelName:   config.Model,
		rateLimiter: ratelimit.NewLimiter(config.TPM, config.RPM),
		retryConfig: config.RetryConfig,
	}, nil
}

// Close closes the Gemini client
func (p *Provider) Close() error {
	return p.client.Close()
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "gemini"
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
		return nil, fmt.Errorf("gemini translate failed: %w", lastErr)
	}

	response.Duration = time.Since(start)
	response.Provider = p.Name()

	return response, nil
}

func (p *Provider) translate(ctx context.Context, req *translator.TranslationRequest) (*translator.TranslationResponse, error) {
	systemPrompt := translator.SystemPrompt(req.PreserveHTML, req.PreserveLiquid)
	userPrompt := fmt.Sprintf("Translate the following text from %s to %s:\n\n%s",
		req.SourceLanguage, req.TargetLanguage, req.Text)

	// Set system instruction
	p.model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(systemPrompt)},
	}

	resp, err := p.model.GenerateContent(ctx, genai.Text(userPrompt))
	if err != nil {
		// Check if error is retryable (429 or 500)
		if isRetryableError(err) {
			return nil, &retry.RetryableError{Err: err}
		}
		return nil, err
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no content returned from Gemini")
	}

	translatedText := fmt.Sprintf("%v", resp.Candidates[0].Content.Parts[0])

	// Extract token usage
	var inputTokens, outputTokens int
	if resp.UsageMetadata != nil {
		inputTokens = int(resp.UsageMetadata.PromptTokenCount)
		outputTokens = int(resp.UsageMetadata.CandidatesTokenCount)
	}

	// Calculate cost (approximate)
	cost := calculateCost(p.modelName, inputTokens, outputTokens)

	return &translator.TranslationResponse{
		TranslatedText: translatedText,
		SourceText:     req.Text,
		TokensUsed: translator.TokenUsage{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
			TotalTokens:  inputTokens + outputTokens,
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
		contains(errStr, "quota") || contains(errStr, "resource_exhausted")
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
// Prices are approximate and should be updated based on current Google pricing
func calculateCost(model string, inputTokens, outputTokens int) float64 {
	var inputPrice, outputPrice float64

	switch {
	case contains(model, "gemini-1.5-pro"):
		inputPrice = 0.00125 / 1000  // $0.00125 per 1K input tokens
		outputPrice = 0.005 / 1000   // $0.005 per 1K output tokens
	case contains(model, "gemini-1.5-flash"):
		inputPrice = 0.000075 / 1000 // $0.000075 per 1K input tokens
		outputPrice = 0.0003 / 1000  // $0.0003 per 1K output tokens
	default:
		inputPrice = 0.00125 / 1000
		outputPrice = 0.005 / 1000
	}

	return float64(inputTokens)*inputPrice + float64(outputTokens)*outputPrice
}
