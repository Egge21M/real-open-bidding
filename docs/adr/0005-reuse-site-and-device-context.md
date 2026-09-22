# Reuse OpenRTB Site and Device for advertising context

ROB needs website and device context that existing advertising integrations can describe without a new field vocabulary. V1 reuses OpenRTB's `site` and `device` structures and standard meanings, requiring `site.domain`, making `device` optional, and deferring the `user` object while retaining ROB's auction and payment contract. Because requests are public, the profile excludes viewer IP addresses, precise coordinates, and persistent device identifiers while preserving browser, language, screen, and capability information.

Agreed on 2026-09-22. The protocol requirements and remaining profile choices are in [FLOW.md: Advertising context](../../FLOW.md#advertising-context).
