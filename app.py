# app.py ----------------------------------------------------------
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS          # still handy if you later split front/back
from dotenv import load_dotenv
import os, requests
import re
import json # Import the json module

# ---------- env --------------------------------------------------
load_dotenv()
# API_KEY = os.getenv("TOGETHER_API_KEY")
API_KEY = "7d5882b655c97395f44585d73e8f92989a12e9277b407479fc1282e8a34e7245"
if not API_KEY:
    raise ValueError("TOGETHER_API_KEY is not set in .env or env vars")

API_URL = "https://api.together.xyz/v1/chat/completions"
HEADERS  = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# ---------- Flask ------------------------------------------------
app = Flask(__name__, static_url_path='', static_folder='.')
CORS(app)

# ---------- simple health‑check ---------------------------------
@app.get("/")
def home():
    return "<h3>Backend up ✔ — go to <a href='/quiz'>/quiz</a> for the quiz.</h3>"

# ---------- serve the quiz HTML ---------------------------------
@app.get("/quiz")
def serve_quiz():
    # index.html is in the same folder as app.py
    return send_from_directory("./templates/", "index.html")

# ---------- API route -------------------------------------------
# --- Load Charities from JSON file ---
def load_charities():
    try:
        # Adjust the path if your JSON file is in a different directory
        with open('charities.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print("Error: charities.json not found. Make sure the file is in the correct directory.")
        return []
    except json.JSONDecodeError:
        print("Error: Could not decode charities.json. Check for JSON syntax errors.")
        return []

CHARITIES = load_charities()

@app.post("/api/charity-match")
def charity_match():
    data     = request.get_json(force=True)
    answers  = data.get("answers", {})

    prefs = "\n".join([
        f"- Cause: {answers.get('cause') or 'None'}",
        f"- Groups: {', '.join(answers.get('groups', []) or ['None'])}",
        f"- Region: {answers.get('region') or 'None'}",
        f"- Faith‑based: {answers.get('faith') or 'No preference'}",
        f"- Support style: {answers.get('support') or 'No preference'}"
    ])

    prompt = f"""
You are a helpful assistant that recommends charities.

User preferences:
{prefs}

From the charity list below, choose the best match.
Return charity name, description, and link.

{CHARITIES}
""".strip()

    payload = {
        "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user",   "content": prompt}
        ]
    }

    resp = requests.post(API_URL, headers=HEADERS, json=payload, timeout=60)
    chat = resp.json()
    ai_result = chat["choices"][0]["message"]["content"]

    match = re.search(r"\*\*(.*?)\*\*", ai_result)
    matched_name = match.group(1) if match else None

    charity_lines = CHARITIES.split("### ")[1:]
    all_charities = []
    for block in charity_lines:
        lines = block.strip().split("\n")
        name = lines[0].strip()
        link_line = next((line for line in lines if line.startswith("[Donation Page](")), None)
        if name and link_line:
            link = re.search(r"\((.*?)\)", link_line).group(1)
            all_charities.append({"name": name, "link": link})

    other_charities = [c for c in all_charities if c["name"] != matched_name]

    return jsonify({
        "choices": chat["choices"],
        "other_charities": other_charities
    })

# ---------- entry‑point -----------------------------------------
# --------
if __name__ == "__main__":
    app.run(debug=True)
