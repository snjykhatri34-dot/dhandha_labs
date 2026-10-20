# Evaluator SOP: one counter visit → one scorecard

Input: one counter clip (audio/video) or its timestamped transcript.
Output: one visit JSON in the shape of `schemas.md`. Nothing else.

**Ground rule: never invent.** Every value comes from the clip, the file name or the upload form. If it isn't there, use `null` / `"unknown"` and add a flag.

---

## Step 1. Identify the visit
- Parse the file name `<store>_<salesperson>_<date>_<visitno>`:
  `B2_Akshay_2026-10-15_1014` → `visit_id: "B2-1014"`, `store: "B2"`, `salesperson: "Akshay"`, `date: "2026-10-15"`.
- Assign speakers. The salesperson is the one who greets, shows pieces and quotes prices (usually Speaker A). Everyone else is a customer.
- If you can't tell who is the salesperson, or the number of customers is unclear, add a flag (`speaker_unclear @MM:SS`).
- All timestamps are `MM:SS` from the start of the clip.

## Step 2. What did the customer ask for? (`asked_for`)
| field | rule |
|---|---|
| `category` | necklace, earrings, ring, bangle, chain, bridal set, … exactly as asked |
| `weight_band` | Map the grams they stated to a band. Use the top of their range when they give one ("up to 30, 35 g" → `20-35`). If the category has no bands (e.g. bridal set), write the stated range (`80-90`). If they gave no weight, write `"unknown"`. |
| `occasion` | Short phrase in their words (`daily office wear`, `anniversary`). `null` if not said. |
| `budget_inr` | A number only if they said one (`one lakh fifty` → `150000`), otherwise `null`. |

Weight bands (g): necklace 0-20 / 20-35 / 35-50 / 50+ · earrings 0-8 / 8-15 / 15+ · ring 0-5 / 5-10 / 10+ · bangle 0-20 / 20-40 / 40+ · chain 0-15 / 15-30 / 30+.

## Step 3. What was shown? (`shown`)
List every piece the salesperson showed or offered, in order, as `"<category> <weight> g"`. Add a design code or tag only if it was said aloud. Suggestions they didn't show get `(suggested)`.

## Step 4. Outcome
| outcome | requires |
|---|---|
| `bought` | An explicit yes: "pack it up", "we'll take it". |
| `deferred_with_follow_up` | A **concrete** next step: a date, a hold, or a phone number taken. |
| `walked_out` | Anything else, including "I'll think about it" or "we'll come back" with no number or date. |

## Step 5. Objections (`objections`)
Each time the customer pushes back: `{"type", "at", "quote"}`, plus `"competitor_mentioned": true` when they name or cite another shop.
Types: `weight`, `design_not_available`, `price_making_charge`, `price_budget`, `old_gold_exchange_rate`, `purity_trust`, `family_decision`, `other`.

## Step 6. Reason not bought (`reason_not_bought`)
- `bought` → `null`.
- Otherwise pick **exactly one** of: `weight_mismatch`, `design_not_available`, `price_making_charge`, `old_gold_exchange_rate`, `purity_trust`, `family_decision`, `just_browsing`, `other`.
- Tie-breakers, in order:
  1. If the customer's stated ask (weight or design) was never met, that wins over price or other objections (B2-1014: weight beats making charge).
  2. Wrong weight shown and nothing in the right weight offered → `weight_mismatch`, even if they also say "nothing smaller" (B2-1016).
  3. Otherwise, the first objection that was never resolved (B2-1019: the exchange rate came before purity).
- `lost_demand = true` only if the reason is `weight_mismatch` or `design_not_available`.

## Step 7. Emotions (`emotions`, `emotion_arc`)
- Record an emotion only if you can name its cue. Each entry is `{"at", "who", "emotion", "cue"}`.
- `cue` starts with the channel, `words`, `voice` or `face`, followed by the evidence: `"words: 'That's far too heavy'"`, `"face: frowns at the price tag"`.
- **No cue, no emotion.** From a transcript you only have `words`. Add `voice`/`face` only from the clip itself.
- `emotion_arc` = the customer's state at the start → at the end, e.g. `interested -> frustrated`.

## Step 8. Handling score (1-5)
Go top-down and take the **first** row that matches.
| score | test | pack example |
|---|---|---|
| 1 | Lost a winnable sale: switched category away from a clear ask, or ignored the ask after the customer restated it | B2-1016 |
| 2 | Defensive or vague on the key objection ("rate is fixed", "we'll only know after testing", "this is how we do it") | B2-1014, B2-1019 |
| 3 | Answered questions, but no persuasion: no alternative, no breakup, no next step | none |
| 4 | Clean and matched the ask, but missed an add-on or follow-up | B2-1018 |
| 5 | Matched the ask, gave a transparent price, offered an alternative **and** set the next step (or closed) | B2-1015, B2-1017 |

Write `handling_evidence`: 1-2 timestamped facts that justify the score (`"00:50 defended on 'quality' with no price breakup"`).

## Step 9. Coaching tip
One sentence a manager can say out loud. It fixes the lowest moment in the visit and says what to do instead. For a score of 5, name the visit as a model to copy.

## Step 10. Flags (`flags`)
Add one whenever confidence is low. Never guess instead.
`speaker_unclear @MM:SS` · `audio_noise @MM:SS` · `camera_blocked @MM:SS` · `weight_not_stated` · `outcome_unclear` · `transcript_only`.

---

## Self-check before returning
- [ ] Valid JSON, keys as in `schemas.md` (`store`, `emotion_arc`). No extra prose.
- [ ] `reason_not_bought` is `null` if and only if `outcome = bought`, and it is from the fixed list.
- [ ] `lost_demand` is consistent with `reason_not_bought`.
- [ ] Every objection, emotion and evidence line has a timestamp that exists in the clip.
- [ ] Every emotion names its cue channel.
- [ ] Nothing appears that wasn't said or seen.

## Notes for the evaluator (comparing against `expected_outputs/visits/`)
- The hand labels use older key names: `branch` = `store`, `customer_sentiment_arc` = `emotion_arc`. Map them before comparing.
- B2-1014's label lists tag `NEC-552`, which comes from the ERP and is never said in the clip. An extractor that leaves it out shouldn't be penalised.
- Score these fields exactly: `outcome`, `reason_not_bought`, `lost_demand`, `asked_for.category`, `asked_for.weight_band`, `handling_score` (±1 is a near miss).
- Score these fields loosely: objection types and timestamps (±3 s), and whether the emotion set matches.
