package ratelimit

import (
	"context"
	"sync"
	"time"
)

// Limiter implements rate limiting for tokens per minute (TPM) and requests per minute (RPM)
type Limiter struct {
	tpm int   // Tokens per minute limit
	rpm int   // Requests per minute limit

	tokensMu       sync.Mutex
	tokens         int
	tokensLastFill time.Time

	requestsMu       sync.Mutex
	requests         int
	requestsLastFill time.Time
}

// NewLimiter creates a new rate limiter with specified TPM and RPM limits
func NewLimiter(tpm, rpm int) *Limiter {
	now := time.Now()
	return &Limiter{
		tpm:              tpm,
		rpm:              rpm,
		tokens:           tpm,
		tokensLastFill:   now,
		requests:         rpm,
		requestsLastFill: now,
	}
}

// Wait blocks until the request can proceed within rate limits
func (l *Limiter) Wait(ctx context.Context, tokensNeeded int) error {
	// Wait for request limit
	if err := l.waitRequests(ctx); err != nil {
		return err
	}

	// Wait for token limit
	if err := l.waitTokens(ctx, tokensNeeded); err != nil {
		return err
	}

	return nil
}

func (l *Limiter) waitRequests(ctx context.Context) error {
	l.requestsMu.Lock()
	defer l.requestsMu.Unlock()

	for {
		// Refill based on elapsed time
		now := time.Now()
		elapsed := now.Sub(l.requestsLastFill)
		if elapsed >= time.Minute {
			l.requests = l.rpm
			l.requestsLastFill = now
		}

		if l.requests > 0 {
			l.requests--
			return nil
		}

		// Calculate wait time
		waitTime := time.Minute - elapsed
		l.requestsMu.Unlock()

		select {
		case <-ctx.Done():
			l.requestsMu.Lock()
			return ctx.Err()
		case <-time.After(waitTime):
			l.requestsMu.Lock()
		}
	}
}

func (l *Limiter) waitTokens(ctx context.Context, tokensNeeded int) error {
	l.tokensMu.Lock()
	defer l.tokensMu.Unlock()

	for {
		// Refill based on elapsed time
		now := time.Now()
		elapsed := now.Sub(l.tokensLastFill)
		if elapsed >= time.Minute {
			l.tokens = l.tpm
			l.tokensLastFill = now
		}

		if l.tokens >= tokensNeeded {
			l.tokens -= tokensNeeded
			return nil
		}

		// Calculate wait time
		waitTime := time.Minute - elapsed
		l.tokensMu.Unlock()

		select {
		case <-ctx.Done():
			l.tokensMu.Lock()
			return ctx.Err()
		case <-time.After(waitTime):
			l.tokensMu.Lock()
		}
	}
}

// SetTPM updates the tokens per minute limit
func (l *Limiter) SetTPM(tpm int) {
	l.tokensMu.Lock()
	defer l.tokensMu.Unlock()
	l.tpm = tpm
}

// SetRPM updates the requests per minute limit
func (l *Limiter) SetRPM(rpm int) {
	l.requestsMu.Lock()
	defer l.requestsMu.Unlock()
	l.rpm = rpm
}
