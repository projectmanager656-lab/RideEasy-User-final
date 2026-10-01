# Security & Configuration Preferences

- Never invent secrets, merchant IDs, API keys, transaction IDs, or UPI IDs; gateway/secret keys must remain server-side and never be exposed in React/Vite or hard-coded in the frontend. Confidence: 0.9
- Do not arbitrarily overwrite .env files; instead update .env.example/documentation and state exactly what the user must configure manually. Confidence: 0.85
- When a business rule is undecided/not finalized, do not guess or invent it (e.g., a platform-fee amount or bearer) — prepare safely, report readiness, and wait for the decision. Confidence: 0.8
- Avoid weakening security controls just to eliminate an error (e.g., do not weaken OTP verification or casually change JWT_SECRET to fix a bug). Confidence: 0.8
- When a value genuinely needs client-side configuration, prefer a non-secret persisted identifier provisioned server-side/config-side over trusting frontend-supplied values. Confidence: 0.7
