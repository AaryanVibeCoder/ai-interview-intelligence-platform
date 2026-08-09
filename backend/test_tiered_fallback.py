"""
Test script to verify the 3-tier LLM fallback chain works end-to-end.

Test 1: Normal call → should hit Groq (tier="groq")
Test 2: Monkey-patch groq_client to raise RateLimitError → OpenRouter should serve
Test 3: Restore and confirm normal behavior resumes
Test 4: Coding challenge JSON generation via _tiered_chat
"""
import asyncio
import os
import sys
import time
from unittest.mock import AsyncMock

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

async def main():
    from app.api.interview import (
        _tiered_chat, groq_client,
    )
    from openai import RateLimitError
    import httpx
    
    test_messages = [
        {"role": "system", "content": "You are a JSON-only API. Respond with ONLY valid JSON."},
        {"role": "user", "content": 'Return: {"status":"ok","provider":"unknown"}'},
    ]
    
    # ── Test 1 ──────────────────────────────────────────────────────────────
    print("=" * 70)
    print("Test 1: Normal _tiered_chat call (Groq should serve)")
    print("=" * 70)
    t0 = time.monotonic()
    try:
        response, tier = await _tiered_chat(
            messages=test_messages,
            max_tokens=50,
            temperature=0.1,
            call_site="test_normal",
        )
        latency = int((time.monotonic() - t0) * 1000)
        content = response.choices[0].message.content or ""
        print(f"  ✅ tier={tier} | latency={latency}ms | content={content[:200]}")
    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        print(f"  ❌ FAILED | latency={latency}ms | error={e}")

    # ── Test 2 ──────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("Test 2: Force Groq 429 RateLimitError → OpenRouter should serve")
    print("=" * 70)
    
    # Monkey-patch the groq_client.chat.completions.create to raise RateLimitError
    real_create = groq_client.chat.completions.create
    
    async def fake_rate_limit(*args, **kwargs):
        mock_response = httpx.Response(
            status_code=429,
            request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
            json={"error": {"message": "Rate limit exceeded", "type": "tokens", "code": "rate_limit_exceeded"}},
        )
        raise RateLimitError(
            message="Rate limit exceeded",
            response=mock_response,
            body={"error": {"message": "Rate limit exceeded"}},
        )
    
    groq_client.chat.completions.create = fake_rate_limit
    
    t0 = time.monotonic()
    try:
        response, tier = await _tiered_chat(
            messages=test_messages,
            max_tokens=50,
            temperature=0.1,
            call_site="test_fallback",
        )
        latency = int((time.monotonic() - t0) * 1000)
        content = response.choices[0].message.content or ""
        print(f"  ✅ tier={tier} | latency={latency}ms | content={content[:200]}")
        if tier == "openrouter":
            print("  🎯 FALLBACK PATH CONFIRMED: Groq 429 → OpenRouter served successfully")
        else:
            print(f"  ⚠️  UNEXPECTED: Expected tier=openrouter but got tier={tier}")
    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        print(f"  ❌ BOTH TIERS FAILED | latency={latency}ms | error={e}")
    
    # Restore
    groq_client.chat.completions.create = real_create
    
    # ── Test 3 ──────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("Test 3: Key restored — Groq should serve again")
    print("=" * 70)
    t0 = time.monotonic()
    try:
        response, tier = await _tiered_chat(
            messages=test_messages,
            max_tokens=50,
            temperature=0.1,
            call_site="test_restored",
        )
        latency = int((time.monotonic() - t0) * 1000)
        content = response.choices[0].message.content or ""
        print(f"  ✅ tier={tier} | latency={latency}ms | content={content[:200]}")
    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        print(f"  ❌ FAILED | latency={latency}ms | error={e}")

    # ── Test 4 ──────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("Test 4: Coding challenge generation via _tiered_chat")
    print("=" * 70)
    coding_messages = [
        {"role": "system", "content": "You are a precise coding challenge generator. Output strictly valid JSON."},
        {"role": "user", "content": 'Generate 1 coding challenge as JSON: [{"id":"test-slug","title":"Test","description":"desc","difficulty":"medium","testCases":[{"id":"t1","input":"x=1","expectedOutput":"1"}]}]'},
    ]
    t0 = time.monotonic()
    try:
        response, tier = await _tiered_chat(
            messages=coding_messages,
            max_tokens=800,
            temperature=0.1,
            call_site="test_coding_gen",
        )
        latency = int((time.monotonic() - t0) * 1000)
        content = response.choices[0].message.content or ""
        print(f"  ✅ tier={tier} | latency={latency}ms | content={content[:300]}")
    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        print(f"  ❌ FAILED | latency={latency}ms | error={e}")

if __name__ == "__main__":
    asyncio.run(main())
