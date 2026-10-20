# counter-intelligence/ — Build Day inputs (LTV, Oct 20, 2026)

Ayse Ezgi Aksoy, Cherub Kapoor, Sanjay Khatri, Shinjini Palit. **All data here is synthetic.**

```
CLAUDE.md                     short context for Claude: the business, reasons list, scoring rubric
schemas.md                    the shared visit format (and a suggested table + MCP tools) we agree on at the start
data/transcripts/             6 English counter conversations: test inputs AND scripts to act out on camera
data/recordings/              empty: we record a few 1-3 minute clips on phones at the start
data/sample_day/              102 analysed visits for one day, so the report and MCP streams can start straight away
data/mock_erp/                stock_register.csv (312 pieces, 3 stores) + planogram_targets.csv, for check_stock
expected_outputs/visits/      hand-labelled answers for the 6 conversations
expected_outputs/daily_report_expected.md     one example of a great daily report
expected_outputs/daily_report_reference.json  the numbers that report should contain
expected_outputs/owner_questions.md           the owner's question chain the MCP server should answer
```

Before class: open the folder in Claude Code or Cowork, ask Claude to summarise it, and think about which stream you'd enjoy.
Accounts per stream (free, personal): a Gemini key from Google AI Studio (1) · Supabase + Resend (2) · Vercel (3).
