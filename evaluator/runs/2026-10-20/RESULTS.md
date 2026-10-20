# SOP run on the 6 sample transcripts (2026-10-20)

How it was run: each transcript went to a fresh Claude agent that saw only `evaluator/SOP.md`, the transcript and its metadata (no observations, so `words` cues only). The agents couldn't see `expected_outputs/`. Their outputs are the `B2-*.json` files in this folder. This tests the SOP itself; the real pipeline will use a different model.

## Key fields vs the hand labels

| Visit | outcome | reason_not_bought | lost_demand | category | weight_band | handling_score |
|---|---|---|---|---|---|---|
| B2-1014 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2 |
| B2-1015 | ✅ | ✅ | ✅ | ✅ | ❌ `null` (label `8-15`) | ✅ 5 |
| B2-1016 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 1 |
| B2-1017 | ✅ | ✅ | ✅ | ✅ | ⚠️ `null` (label `80-90 g set`) | ✅ 5 |
| B2-1018 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 4 |
| B2-1019 | ✅ | ✅ | ✅ | ✅ | ⚠️ `null` (label `unknown`) | ✅ 2 |

All 24 outcome, reason, lost-demand and score values match. The 3 weight-band differences come from the SOP's rules, not from mistakes:
- **B2-1015:** the customer gave a budget but no weight, so the SOP says `null`. The label took `8-15` from the earrings that were shown.
- **B2-1017:** bridal sets have no band in `CLAUDE.md`, so the SOP says `null` plus a flag.
- **B2-1019:** no weight was stated. `null` and `unknown` mean the same thing.

## Where the SOP needs tightening

1. **The same objection was listed twice (B2-1019).** The exchange-rate concern appears at 00:23 and again at 00:28. The SOP says to list each objection once, at the first time it was raised.
2. **"First raised" was missed (B2-1019).** The customer raised the exchange rate at 00:10 ("First tell me what rate you'll give"), but the agent used 00:23. The SOP should say that asking about a rate or deduction counts as raising it.
3. **`emotion_arc` doesn't always match the emotion list.** In 1014, 1017, 1018 and 1019 the arc starts at "interested" with no emotion entry behind it. The SOP needs to say where the start state comes from.
4. **Emotions from neutral lines (B2-1018).** "That works" was labelled satisfied, and "Okay, pack it up" was labelled with the made-up emotion "decided". The SOP has no list of emotion words.
5. **Coaching tips on 5-score visits.** Tips for model visits invent improvements (1015, 1017). The SOP could say a 5 gets a "keep doing X" tip.
6. **Weight band when only a budget is given (B2-1015).** The team needs to decide: keep `null`, or take the band from what was shown or bought. If it stays `null`, update the label.

## Coaching tips (for a feel of the output)
- **1014:** When she asks for up to thirty-five grams, show pieces in that range first, and answer the twelve-percent comparison with a price breakup instead of saying the rate is fixed.
- **1016:** When a family asks for a 25-30 g necklace, show the lightest necklaces you have first, or offer to source one and take their number, rather than switching to chains or bangles.
- **1019:** When the family asks about the deduction, walk them through the purity test and the exchange formula with an indicative range, and offer to test the gold on the spot before they leave.
