package tasks

import (
	"testing"

	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

func TestPaidQuickIdleReads(t *testing.T) {
	income := capture(t, "claims/income-job25.png")
	if lv, ok := screens.IncomeJobLevel(income); !ok || lv != 25 {
		t.Errorf("job level %d (%v), want 25", lv, ok)
	}
	// 1335 diamonds against a 100 price.
	if r := vision.Ratio(income, incomeDiamonds, vision.IsGreenText); r < 0.03 {
		t.Errorf("1335/100 read as short (%.3f)", r)
	}
	for file, want := range map[string]int{
		"claims/quickidle-paid.png": 100,
		"claims/quickidle-2nd.png":  150,
		"claims/quickidle-3rd.png":  200, // reflowed: "to" wraps to line two
	} {
		if p, ok := screens.QuickIdlePrice(capture(t, file)); !ok || p != want {
			t.Errorf("%s: price %d (%v), want %d", file, p, ok, want)
		}
	}
	// A free or ticket confirm has no price there.
	if p, ok := screens.QuickIdlePrice(capture(t, "claims/quickidle-free.png")); ok {
		t.Errorf("free confirm read as costing %d", p)
	}
}
