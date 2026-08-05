# TODO — Fix "Start Interview" Session Initialization Failure

## Root Cause
The `/api/interview/start` endpoint in `backend/app/api/interview.py` synchronously awaits an
LLM call to `nvidia/nemotron-3-ultra-550b-a55b` (a very slow 550B model) with `max_tokens=1000`
BEFORE saving any session row. The module-level `AsyncOpenAI` client had NO `timeout`, so the
SDK's effectively-unbounded default (600s) lets the request hang indefinitely, blocking the
FastAPI event loop. First attempt → 500; retries stack on the blocked loop → server becomes
unresponsive → "Failed to fetch". Health check confirms backend not listening on port 8000.

## Fix Strategy
Session creation must NEVER block on an LLM call. The opening question is a fast-follow:
  1. Create the session row synchronously (fast DB write only).
  2. Attach a static fallback opener immediately.
  3. Return to the client NOW.
  4. Fire-and-forget a bounded background task to generate the real opener and swap it in.

## Steps

### Backend
- [x] 1. `backend/app/api/interview.py`:
  - Add `FALLBACK_OPENERS` bank (coding / behavioral / system_design / default).
  - Keep `timeout=60.0, max_retries=1` on the module-level `AsyncOpenAI` client.
  - Restructure `start_interview`: CREATE session row FIRST (no LLM), attach fallback
    opener, return immediately, spawn bounded background task for personalized opener.
  - `InterviewStartRequest` accepts optional company/type/role/job_type for direct starts.
  - try/except → structured 4xx/5xx responses.
  - Add GET `/api/interview/session/{session_id}` status endpoint (question_source poll).
- [x] 2. `backend/app/models/interview_session.py`: `question_source` column exists, `interview_profile_id` is nullable.
- [x] 3. `backend/app/schemas/interview_session.py`: `InterviewSessionStatusResponse` added.
- [x] 4. Alembic migration `d2e3f4a5b6c7` applied (add `question_source`, make `interview_profile_id` nullable).
- [x] 5. `backend/main.py`: Add global `@app.exception_handler(Exception)` + `HTTPException`
     handler returning structured JSON 500/4xx (prevent process crash / raw tracebacks).

### Frontend
- [x] 6. `frontend/src/store/interview-store.ts`: add `setCurrentQuestion` + `questionSource`/`setQuestionSource` (Audited: verified).
- [x] 7. `frontend/src/features/interview/components/InterviewSetupWizard.tsx`: (Audited & Fixed)
  - Surface `ApiError.body.detail` in the modal (actionable message) instead of raw `err.message`.
  - Add double-submit guard (ref-based) + safety timeout release.
  - Persist `startData.question` + `question_source` into the interview store.
- [x] 8. `frontend/src/app/interview/behavioral/page.tsx`: (Audited & Fixed)
  - Remove hardcoded `interview_profile_id: 1`; use inline store config (company/type/level/role/jobType).
  - Poll GET session status when `question_source === "fallback"`; swap to personalized opener
    if it flips to `"llm"` and the candidate hasn't started answering; never interrupt Eleanor mid-speech.

### Verification
> [!NOTE]
> Run commands inside `run_command` failed due to platform sandbox restrictions. Detailed instructions and expected results for steps 9–13 are documented in [walkthrough.md](file:///C:/Users/ACER/.gemini/antigravity-ide/brain/b9cbe3b8-3929-4bf0-b105-3646eb4510af/walkthrough.md).
- [ ] 9. Restart backend (`uvicorn`), confirm `/api/interview/start` returns 200 in <1s.
- [ ] 10. Kill LLM connectivity (bad API key) — confirm session still starts with fallback, no 500.
- [ ] 11. Confirm background task failure doesn't crash the process or affect other requests.
- [ ] 12. Confirm double-submit blocked (rapid double-click → single session).
- [ ] 13. Confirm fallback question swaps to LLM opener when candidate hasn't started answering.

