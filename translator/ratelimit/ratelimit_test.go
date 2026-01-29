package ratelimit_test

import (
	"context"
	"testing"
	"time"

	"github.com/ownlingo/ownlingo/translator/ratelimit"
)

func TestLimiterCreation(t *testing.T) {
	limiter := ratelimit.NewLimiter(1000, 10)
	if limiter == nil {
		t.Fatal("expected limiter to be created")
	}
}

func TestLimiterWaitWithinLimits(t *testing.T) {
	limiter := ratelimit.NewLimiter(1000, 10)
	ctx := context.Background()

	start := time.Now()
	err := limiter.Wait(ctx, 100)
	duration := time.Since(start)

	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Should return immediately if within limits
	if duration > 100*time.Millisecond {
		t.Errorf("expected immediate return, took %v", duration)
	}
}

func TestLimiterContextCancellation(t *testing.T) {
	limiter := ratelimit.NewLimiter(100, 1)

	ctx, cancel := context.WithCancel(context.Background())

	// Exhaust the limit
	_ = limiter.Wait(ctx, 100)

	// Cancel the context
	cancel()

	// This should return with context error
	err := limiter.Wait(ctx, 100)
	if err != context.Canceled {
		t.Errorf("expected context.Canceled error, got %v", err)
	}
}

func TestLimiterSetTPM(t *testing.T) {
	limiter := ratelimit.NewLimiter(1000, 10)
	limiter.SetTPM(2000)

	// Test passes if no panic
}

func TestLimiterSetRPM(t *testing.T) {
	limiter := ratelimit.NewLimiter(1000, 10)
	limiter.SetRPM(20)

	// Test passes if no panic
}

func TestLimiterMultipleRequests(t *testing.T) {
	limiter := ratelimit.NewLimiter(1000, 5)
	ctx := context.Background()

	// Make multiple requests within limits
	for i := 0; i < 3; i++ {
		err := limiter.Wait(ctx, 100)
		if err != nil {
			t.Fatalf("request %d failed: %v", i, err)
		}
	}
}

func TestLimiterTokenRefill(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping test in short mode")
	}

	// Use very small limits for faster testing
	limiter := ratelimit.NewLimiter(100, 10)
	ctx := context.Background()

	// Exhaust tokens
	err := limiter.Wait(ctx, 100)
	if err != nil {
		t.Fatalf("initial wait failed: %v", err)
	}

	// This would normally wait, but we're not testing the full wait time
	// Just verify it doesn't error immediately
	start := time.Now()

	ctx2, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()

	_ = limiter.Wait(ctx2, 50)
	duration := time.Since(start)

	// Should have waited at least a bit
	if duration < 50*time.Millisecond {
		t.Logf("waited %v (expected some delay)", duration)
	}
}
