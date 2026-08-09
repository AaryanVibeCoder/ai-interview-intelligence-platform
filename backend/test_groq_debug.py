import os
import json
import urllib.request
import urllib.error
import time
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

def test_groq_debug():
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

    # Test: Generating 3 coding challenges using openai/gpt-oss-20b
    prompt = """You are an elite technical interviewer. Generate exactly 3 personalized coding challenges/practice questions in typical style of 'Stripe' for a candidate interviewing for the position of 'Software Engineer' (Experience Level: 'medium').
CRITICAL REQUIREMENTS:
- The difficulty of the generated questions MUST be 'medium'.
- Tailor the questions specifically to the company's focus/tier profile.
- Make sure each question has exactly 3 language starters: 'javascript', 'python', 'cpp'.
- Make sure starter code function signatures are synchronized and consistent across languages.
- You MUST respond with a single, valid JSON list containing exactly 3 objects.
- Do NOT wrap in markdown fences or include any explanation.
"""

    payload = {
        "model": "openai/gpt-oss-20b",
        "messages": [
            {"role": "system", "content": "You are a precise coding challenge generator. Output strictly valid JSON lists."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 3000,
        "temperature": 0.1
    }

    print("=" * 70)
    print("Test: Querying openai/gpt-oss-20b with max_tokens=3000")
    print("=" * 70)
    t0 = time.monotonic()
    req = urllib.request.Request(chat_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            latency = int((time.monotonic() - t0) * 1000)
            body = json.loads(resp.read().decode("utf-8"))
            print(f"Status: {resp.getcode()} | Latency: {latency}ms")
            choices = body.get("choices", [])
            if choices:
                choice = choices[0]
                message = choice.get("message", {})
                content = message.get("content")
                finish_reason = choice.get("finish_reason")
                print(f"Finish Reason: {finish_reason}")
                print(f"Content type: {type(content)}")
                if content is not None:
                    print(f"Content Length: {len(content)}")
                    print(f"Content Snippet: {content[:400]}")
                    print(f"Content Ends With: {content[-100:] if len(content) > 100 else content}")
                else:
                    print("Content is None!")
            else:
                print("No choices returned!")
            print(f"Raw Response: {json.dumps(body, indent=2)[:1000]}")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code} - {e.read().decode('utf-8')[:500]}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    test_groq_debug()
