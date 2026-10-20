# Owner's question chain (Workstream 3 test), asked in Claude connected to our MCP server

1. "Which pieces are we losing sales on because we don't have them?"
   Expected: light necklaces, 20-35 g. At B2, 11 of 12 customers who asked for one on Oct 17 left without buying (cite visit ids from data/sample_day). Also: 9 losses with reason design_not_available.
2. "Check availability in the ERP."
   Expected (check_stock): B2 holds 0 vs target 6; B1 holds 12 vs target 8 (4 surplus); B3 holds 5 vs target 4 (1 surplus).
   Then: offer to DRAFT a transfer of 4 from B1 (and 1 from B3) for the owner to approve. Never execute it.
3. "Who on the team needs coaching most, and on what?"
   Expected: Akshay, 0 of 8 sold; his losses are mostly weight mismatch. Model to copy: Priya, 8 of 10 (e.g. B2-1015 @00:31, price breakup plus a lighter option).
4. "Why are we losing customers at B3?"
   Expected: 5 of 14 losses at B3 are about the old-gold exchange rate. Suggest a written exchange formula.
