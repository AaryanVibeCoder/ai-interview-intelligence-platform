import os
import json
import urllib.request
import urllib.error
import time
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

def test_groq_json():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("ERROR: GROQ_API_KEY not found.")
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    chat_url = "https://api.groq.com/openai/v1/chat/completions"

    # Test 1: Simple structured JSON (interview scoring style)
    print("=" * 70)
    print("Test 1: Interview scoring JSON output (openai/gpt-oss-20b)")
    print("=" * 70)
    payload1 = {
        "model": "openai/gpt-oss-20b",
        "messages": [
            {"role": "system", "content": "You are a JSON-only evaluation API. Respond with ONLY a JSON object."},
            {"role": "user", "content": 'Evaluate this answer: "I used Python to build a REST API with Flask". Score 0-10. Return JSON: {"feedback":{"score":N,"strengths":["..."],"gaps":["..."]},"next_question":"..."}'}
        ],
        "max_tokens": 500,
        "temperature": 0.3
    }

    t0 = time.monotonic()
    req = urllib.request.Request(chat_url, data=json.dumps(payload1).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            latency = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            print(f"Status: {resp.getcode()} | Latency: {latency}ms")
            print(f"Content: {content}")
            print(f"Content is None: {content is None}")
            print(f"Content length: {len(content) if content else 0}")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code} - {e.read().decode('utf-8')[:300]}")

    # Test 2: Coding challenge generation (the critical use case)
    print("\n" + "=" * 70)
    print("Test 2: Coding challenge JSON generation (openai/gpt-oss-20b)")
    print("=" * 70)
    payload2 = {
        "model": "openai/gpt-oss-20b",
        "messages": [
            {"role": "system", "content": "You are a precise coding challenge generator. Output strictly valid JSON."},
            {"role": "user", "content": 'Generate exactly 1 coding challenge as a JSON object: {"id":"slug","title":"Title","description":"Problem desc","difficulty":"medium","testCases":[{"id":"t1","input":"nums=[2,7,11], target=9","expectedOutput":"[0,1]"}]}'}
        ],
        "max_tokens": 800,
        "temperature": 0.1
    }

    t0 = time.monotonic()
    req = urllib.request.Request(chat_url, data=json.dumps(payload2).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            latency = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            print(f"Status: {resp.getcode()} | Latency: {latency}ms")
            print(f"Content: {content}")
            print(f"Content is None: {content is None}")
            print(f"Content length: {len(content) if content else 0}")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code} - {e.read().decode('utf-8')[:300]}")

    # Test 3: Same tests with llama-3.3-70b-versatile for comparison
    print("\n" + "=" * 70)
    print("Test 3: Interview scoring JSON (llama-3.3-70b-versatile)")
    print("=" * 70)
    payload1["model"] = "llama-3.3-70b-versatile"
    t0 = time.monotonic()
    req = urllib.request.Request(chat_url, data=json.dumps(payload1).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            latency = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            print(f"Status: {resp.getcode()} | Latency: {latency}ms")
            print(f"Content: {content[:500] if content else 'None'}")
            print(f"Content length: {len(content) if content else 0}")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code} - {e.read().decode('utf-8')[:300]}")

    # Test 4: qwen
    print("\n" + "=" * 70)
    print("Test 4: Interview scoring JSON (qwen/qwen3.6-27b)")
    print("=" * 70)
    payload1["model"] = "qwen/qwen3.6-27b"
    t0 = time.monotonic()
    req = urllib.request.Request(chat_url, data=json.dumps(payload1).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            latency = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            print(f"Status: {resp.getcode()} | Latency: {latency}ms")
            print(f"Content: {content[:500] if content else 'None'}")
            print(f"Content length: {len(content) if content else 0}")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code} - {e.read().decode('utf-8')[:300]}")

if __name__ == "__main__":
    test_groq_json()
