# SOP v2 rerun on the 6 sample transcripts (2026-10-20)

This run used the SOP at commit `1b4580b`, with the same setup as `../2026-10-20/`: one blind agent per transcript, transcript only, no access to the hand labels.

## Key fields vs the hand labels

| Visit | outcome | reason | lost_demand | category | weight_band | score |
|---|---|---|---|---|---|---|
| B2-1014 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2 |
| B2-1015 | ✅ | ✅ | ✅ | ✅ | ✅ `8-15` (was ❌) | ✅ 5 |
| B2-1016 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 1 |
| B2-1017 | ✅ | ✅ | ✅ | ✅ | ⚠️ `null` (label `80-90 g set`; no bridal band) | ✅ 5 |
| B2-1018 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 4 |
| B2-1019 | ✅ | ✅ | ✅ | ✅ | ⚠️ `null` (label `unknown`; same meaning) | ✅ 2 |

## The six fixes, checked
1. **Duplicate objections:** fixed. B2-1019 now has one exchange-rate entry, with `competitor_mentioned: true`.
2. **"First raised":** fixed. B2-1019's exchange-rate objection is now at 00:10, matching the label.
3. **Arc matches the emotion list:** fixed in all 6 (first entry → last entry).
4. **Emotion words:** all from the list. "That works" is no longer an emotion.
5. **Tips for 5-score visits:** fixed. B2-1015 and B2-1017 now name the move to keep (00:49, 00:56).
6. **Band from the chosen piece:** fixed. B2-1015 gets `8-15`, with a flag.

## New edge case
- **B2-1016:** the agent put `competitor_mentioned: true` on the weight objection because of the parting line "let's try the showroom in Shimla" (00:46). That line is a walkout, not a restatement of the weight objection. The hand label has no competitor flag for it. A possible rule: a competitor named only as the customer leaves goes in `flags`, not on an objection. That rule isn't in the SOP yet.
