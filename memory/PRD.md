# JobMatch AI — PRD & Handover

## Original problem statement
Production-ready AI-powered Job Portal for India ("Find the right job, not just more jobs." / "Your next job, matched smarter.") connecting Job Seekers, Recruiters/Companies and Admins: AI job matching, resume parsing/score, recruiter hiring pipeline, application tracking, AI interview coach, admin moderation, fraud reporting, privacy controls, monetization architecture, analytics, clearly-labelled test data.

## User choices
- Stack: Expo (React Native, web preview) + FastAPI + MongoDB (platform stack instead of Next.js/Node/Postgres/Capacitor). Android build via Emergent Publish (replaces Capacitor).
- Auth: email+password (bcrypt, opaque bearer session tokens, 7-day TTL) + Emergent-managed Google login
- AI: Emergent Universal LLM key, OpenAI gpt-5.4
- Storage: Emergent Object Storage (resumes, photos, logos)
- Design: indigo/white premium professional (design_guidelines.json)

## Architecture
- backend/core.py (DB, sessions, RBAC `require_roles`, sanitization, rate limiting, audit, analytics, notify + push/email abstractions)
- backend/matching.py (weighted 0–100 match: skills30/exp20/role15/location10/salary10/edu5/work-mode5/industry5 with reasons+gaps)
- backend/ai.py (resume parse+score, resume improve before/after, interview questions + feedback; honesty constraints)
- backend/storage.py, domain.py (stages, completion %, fraud heuristics, plans)
- backend/routes_main.py (auth, files, candidate, resume, jobs, applications, notifications, coach, plans/payments)
- backend/routes_recruiter.py, routes_admin.py, seed.py (indexes, plans/taxonomy, test data + purge)
- frontend: expo-router groups (auth)/(candidate)/(recruiter)/(admin) + shared stack screens; NativeTabs on iOS 26+, JS Tabs elsewhere

## Collections (MongoDB; string ids, unique indexes)
users, user_sessions(TTL), candidate_profiles, recruiter_profiles, admin_users, companies, company_verifications, files, resumes, resume_analysis, jobs, job_skills, skills, categories, industries, saved_jobs(unique user+job), applications(unique candidate+job), application_events, interviews, notifications, messages, reports, subscriptions, payments, plans, audit_logs, analytics_events, daily_active, push_tokens, data_requests

## Implemented (2026-06)
- All 3 roles with backend-enforced RBAC; register/login/logout/logout-all/Google
- Candidate profile (skippable fields, completion %), photo upload, privacy settings, account deletion, data-deletion request
- Resume upload (PDF/DOC/DOCX, 5MB, magic-byte check) / view / download / replace / delete; async AI parsing + score + auto-fill empty profile fields; AI improvement modes
- Jobs DB with all fields/statuses, search + filters + sort + match filters, pagination/infinite scroll, home sections, job details with AI fit analysis, save, report, external-job handling
- Apply with checklist + consent + contact-sharing control, duplicate prevention, notifications, tracker timeline, withdraw
- Recruiter dashboard metrics, job CRUD/pause/close/draft, plan limits, pipeline filters, applicant detail (privacy-filtered), stages, notes, interviews, messaging, resume download
- Admin metrics, analytics charts, company verification, job moderation/feature/edit/remove, admin-posted jobs, reports review, user suspend, applications list, taxonomy, plans editor, integrations status, audit logs, test-data purge
- Fraud heuristics (payment requests, personal contacts, duplicates, unrealistic pay) → held for admin review, never auto-accusation
- Testing: iteration_1 — backend 51/51, frontend core flows pass

## Env vars (backend/.env)
MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, SEED_TEST_DATA (set false/remove in production). Optional: PAYMENT_PROVIDER, PAYMENT_KEY_ID, PAYMENT_KEY_SECRET, FCM_SERVER_KEY, EMAIL_PROVIDER_API_KEY, JOB_FEED_API_KEY. Frontend: EXPO_PUBLIC_BACKEND_URL only.

## Manual configuration remaining
- Set SEED_TEST_DATA=false and purge test data before launch
- Payment provider adapter (Razorpay/Cashfree) — checkout returns 503 until configured
- Push notifications (needs google-services.json + build) and email provider
- Email OTP login (not built; needs email provider)
- Legitimate external job feed integrations

## Backlog
- P1: native date/time picker for interviews; email OTP; payment adapter; push notifications
- P2: candidate premium gating, recruiter talent search beyond applicants, hiring analytics for Pro, boxShadow web style migration

## 2026-06 Auth & connectivity hardening
- Root cause analysis: backend publicly reachable over HTTPS; client mapped every fetch exception to "No internet" (hid misconfigured/local/HTTP backend URL in locally-built APK, timeouts, cleartext block). Android Google flow could drop late deep links.
- Fixes: error classification (network/timeout/config/HTTP), 30s/90s/120s timeouts, backend URL validation (HTTPS, no localhost/10.0.2.2), /api/health with DB ping, login "test connection" diagnostic, AUTH_DEBUG logs (no secrets), 422→400 readable errors, password policy (8+ chars, letter+number), session restore only clears on 401/403, permanent deep-link listener for Google, INTERNET permission explicit.
- Tests: iteration_2 backend 63/63, frontend auth flows pass.

## 2026-06 Android build missing backend URL (confirmed via user screenshot)
- Root cause confirmed: standalone Android build bundled without EXPO_PUBLIC_BACKEND_URL ("not set"). .env is git-ignored and never committed, so builds made from the repo/GitHub or builds without injected secrets lack it.
- Fix in code: api.ts falls back to Expo hostUri (Expo Go/dev proxy works even without the var); config error message now tells the user exactly what to do.
- Production path: set EXPO_PUBLIC_BACKEND_URL in Deployment Panel → Secrets, redeploy, regenerate build (secrets not auto-overwritten on redeploy).
- Local Android Studio builds: .env must be recreated manually (not synced via GitHub by design).
