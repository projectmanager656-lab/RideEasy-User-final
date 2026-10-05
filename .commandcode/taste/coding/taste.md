# Coding Preferences

- Fix problems at their true root cause; never apply temporary workarounds or band-aid patches. Confidence: 0.9
- Never hide or suppress errors (console or HTTP) to make things look fixed — fix the underlying logic/route instead. Confidence: 0.85
- Do not add blind/"random" retries to mask flaky behavior. Confidence: 0.8
- Do not hard-code machine- or environment-specific values (LAN IPs, hosts) into application source; drive them through env/config files. Confidence: 0.8
- Preserve all existing working functionality; make targeted changes and leave everything else exactly as it was. Confidence: 0.8
- Never weaken security (auth, ownership) or business/eligibility validation just to make a feature work. Confidence: 0.75
- Prefer atomic, race-safe operations (conditional DB update predicates) so concurrent actions cannot corrupt state (e.g., two drivers accepting one ride). Confidence: 0.7
