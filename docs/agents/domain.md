# Domain documentation

ROB uses a single context: a root glossary and one ADR directory.

## Read before domain work

Read `CONTEXT.md` before exploring or changing ROB specifications or code. Read relevant decisions under `docs/adr/` before proposing or changing the behavior they cover. If a glossary or relevant ADR does not exist, continue with the available specifications.

## Document responsibilities

- `CONTEXT.md`: canonical domain terms and their meanings. Keep it a glossary, with implementation details in the specifications or ADRs.
- `docs/adr/`: accepted architectural decisions, their alternatives, and consequences. Use numbered files such as `0001-single-bid-authorization.md` when a decision warrants a record.
- `FLOW.md`: protocol flow, payment authorization, commitments, settlement, and refunds.
- `NOSTR.md`: Nostr transport, event fields, and payloads.
- `OPENRTB.md` and `PREBID.md`: reference material; only decisions explicitly adopted in the ROB specifications are ROB requirements.

## Maintain consistent language

Use the glossary's terms in ROB specifications, code, tests, issues, and explanations. Preserve external standards' field names when documenting those standards.

When a term is agreed, record its definition in `CONTEXT.md` and update affected ROB usage. Distinguish proposed terminology and behavior from accepted decisions.

Record an ADR when a decision has meaningful reversal cost, would otherwise be surprising, and involves a real tradeoff. Use the `domain-modeling` skill's ADR format. Keep requirements in the specifications and rationale in the ADR, linking them where useful.

Surface conflicts with existing glossary definitions or ADRs. When an authorized change replaces an accepted decision, update the affected specifications and explicitly supersede the old ADR.
