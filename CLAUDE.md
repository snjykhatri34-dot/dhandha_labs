# Counter Intelligence: context for Claude

We are building conversation analytics for **Verma Jewellers** (Solan, Himachal Pradesh; family-run since 1967; 3 stores plus exhibitions; ~₹300 crore revenue). Sales happen in many one-to-one conversations at separate counters, often with family groups (in real stores often Hinglish; this build is English only). The owner can't be at every counter. He wants to know, every day, why people bought or walked out, how they felt, and which salespeople convert.

**All data in this folder is synthetic. Never invent facts that are not in a file or a recording.**

## The pipeline (suggested; the team decides the details)
1. **Insight extraction (Workstream 1):** a counter clip (video or audio, English) is uploaded to Supabase Storage; one model (Gemini suggested: audio + video together) plus our skill file returns one visit scorecard JSON (see `schemas.md`).
2. **Memory and daily report (Workstream 2):** every scorecard is saved to a Supabase `visits` table; at closing the day rolls up into a one-page report (emailed via Resend).
3. **MCP server for the owner's agent (Workstream 3):** a Next.js app on Vercel (Vercel's MCP template) is the single query surface: daily report, visit search, lost demand, and stock checks against `data/mock_erp/`.

## Rules
- Every claim cites its source: visit id + timestamp (`B2-1014 @00:44`).
- Emotions must name their cue: `words`, `voice` or `face`. No cue, no emotion.
- Low confidence (unclear speaker, noise, camera blocked) → add to `flags`. Never guess.
- The agent only reads the ERP; actions are drafts for the owner. Log every query (who, when, what).
- Nothing is sent to customers. Reports go only to the owner's agent or inbox. Scorecards are for managers before staff.
- Keep API keys in `.env`; never commit them.

## Domain cheat sheet
- Price ≈ gold rate × net weight × (1 + making %) + stone charges, plus 3% GST.
- Old-gold exchange: purity test, then credit = weight × purity × today's rate minus a deduction. Customers often distrust the deduction.
- Weight bands (g): necklace 0-20 / 20-35 / 35-50 / 50+; earrings 0-8 / 8-15 / 15+; ring 0-5 / 5-10 / 10+; bangle 0-20 / 20-40 / 40+; chain 0-15 / 15-30 / 30+.
- Outcomes: `bought`, `deferred_with_follow_up`, `walked_out`.
- Reasons not bought (use exactly these): `weight_mismatch`, `design_not_available`, `price_making_charge`, `old_gold_exchange_rate`, `purity_trust`, `family_decision`, `just_browsing`, `other`.
- **Lost demand** = not bought because we didn't show or didn't have what was asked (`weight_mismatch`, `design_not_available`).

## Handling score rubric (1-5)
| Score | Meaning | Example in this pack |
|---|---|---|
| 5 | Model visit: matched the ask, transparent price, offered an alternative, set the next step | B2-1015, B2-1017 |
| 4 | Clean, but missed an add-on or follow-up | B2-1018 |
| 3 | Adequate; answered questions, no persuasion | none |
| 2 | Defensive or vague on the key objection | B2-1014, B2-1019 |
| 1 | Lost a winnable sale: ignored the stated ask or switched category | B2-1016 |
