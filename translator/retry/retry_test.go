package retry_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ownlingo/ownlingo/translator/retry"
)

func TestRetryableError(t *testing.T) {
	baseErr := errors.New("base error")
	retryErr := &retry.RetryableError{
		Err:        baseErr,
		StatusCode: 429,
	}

	if retryErr.Error() != baseErr.Error() {
		t.Errorf("expected error message %q, got %q", baseErr.Error(), retryErr.Error())
	}

	if !errors.Is(retryErr, baseErr) {
		t.Error("expected retryable error to wrap base error")
	}
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "retryable error",
			err:  &retry.RetryableError{Err: errors.New("test")},
			want: true,
		},
		{
			name: "non-retryable error",
			err:  errors.New("test"),
			want: false,
		},
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := retry.IsRetryable(tt.err)
			if got != tt.want {
				t.Errorf("IsRetryable() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	config := retry.DefaultConfig()

	if config.MaxRetries <= 0 {
		t.Error("expected MaxRetries > 0")
	}

	if config.InitialBackoff <= 0 {
		t.Error("expected InitialBackoff > 0")
	}

	if config.MaxBackoff <= 0 {
		t.Error("expected MaxBackoff > 0")
	}

	if config.Multiplier <= 1.0 {
		t.Error("expected Multiplier > 1.0 for exponential backoff")
	}
}

func TestDoSuccess(t *testing.T) {
	ctx := context.Background()
	config := retry.DefaultConfig()

	callCount := 0
	operation := func() error {
		callCount++
		return nil
	}

	err := retry.Do(ctx, config, operation)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if callCount != 1 {
		t.Errorf("expected operation to be called once, got %d calls", callCount)
	}
}

func TestDoNonRetryableError(t *testing.T) {
	ctx := context.Background()
	config := retry.DefaultConfig()

	expectedErr := errors.New("non-retryable error")
	callCount := 0

	operation := func() error {
		callCount++
		return expectedErr
	}

	err := retry.Do(ctx, config, operation)
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected error %v, got %v", expectedErr, err)
	}

	if callCount != 1 {
		t.Errorf("expected operation to be called once, got %d calls", callCount)
	}
}

func TestDoRetryableError(t *testing.T) {
	ctx := context.Background()
	config := &retry.Config{
		MaxRetries:     2,
		InitialBackoff: 1 * time.Millisecond,
		MaxBackoff:     10 * time.Millisecond,
		Multiplier:     2.0,
	}

	callCount := 0
	operation := func() error {
		callCount++
		return &retry.RetryableError{Err: errors.New("retryable error")}
	}

	err := retry.Do(ctx, config, operation)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	expectedCalls := config.MaxRetries + 1 // Initial attempt + retries
	if callCount != expectedCalls {
		t.Errorf("expected %d calls, got %d", expectedCalls, callCount)
	}
}

func TestDoSuccessAfterRetries(t *testing.T) {
	ctx := context.Background()
	config := &retry.Config{
		MaxRetries:     3,
		InitialBackoff: 1 * time.Millisecond,
		MaxBackoff:     10 * time.Millisecond,
		Multiplier:     2.0,
	}

	callCount := 0
	operation := func() error {
		callCount++
		if callCount < 3 {
			return &retry.RetryableError{Err: errors.New("retryable error")}
		}
		return nil
	}

	err := retry.Do(ctx, config, operation)
	if err != nil {
		t.Fatalf("expected no error after retries, got %v", err)
	}

	if callCount != 3 {
		t.Errorf("expected 3 calls, got %d", callCount)
	}
}

func TestDoContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	config := &retry.Config{
		MaxRetries:     5,
		InitialBackoff: 100 * time.Millisecond,
		MaxBackoff:     1 * time.Second,
		Multiplier:     2.0,
	}

	callCount := 0
	operation := func() error {
		callCount++
		if callCount == 2 {
			cancel() // Cancel context after first retry
		}
		return &retry.RetryableError{Err: errors.New("retryable error")}
	}

	err := retry.Do(ctx, config, operation)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled error, got %v", err)
	}
}

func TestDoNilConfig(t *testing.T) {
	ctx := context.Background()

	callCount := 0
	operation := func() error {
		callCount++
		return nil
	}

	err := retry.Do(ctx, nil, operation)
	if err != nil {
		t.Fatalf("expected no error with nil config, got %v", err)
	}

	if callCount != 1 {
		t.Errorf("expected operation to be called once, got %d calls", callCount)
	}
}
