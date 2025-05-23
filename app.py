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

CHARITIES_DATA = load_charities()

def format_charities_for_ai(charities_list):
    markdown_output = "# List of Charities\n\n"
    for charity in charities_list:
        # Use .get() with a default empty string/list for safety, though these keys should always exist
        markdown_output += f"### {charity.get('charity', 'Unknown Charity')}\n"
        type_str = ", ".join(charity.get('type', []))
        markdown_output += f"- **Type**: {type_str}\n"
        markdown_output += f"- **Impact**: {charity.get('description', 'No description available')}\n"
        markdown_output += f"[Donation Page]({charity.get('donationLink', '#')})\n\n"
    return markdown_output

# Generate the Markdown string once at startup for the AI prompt
CHARITIES_MARKDOWN_FOR_AI = format_charities_for_ai(CHARITIES_DATA)

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

{CHARITIES_MARKDOWN_FOR_AI}
""".strip()

    payload = {
        "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user",   "content": prompt}
        ]
    }

    try:
        resp = requests.post(API_URL, headers=HEADERS, json=payload, timeout=60)
        resp.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)
        chat = resp.json()
        ai_result = chat["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        return jsonify({"error": "Failed to get response from AI API"}), 500
    except (KeyError, IndexError) as e:
        print(f"Error parsing AI response: {e}. Full response: {json.dumps(chat, indent=2)}")
        return jsonify({"error": "Unexpected AI response format from Together AI"}), 500

    match = re.search(r"\*\*(.*?)\*\*", ai_result)
    matched_name = match.group(1) if match else None

    # --- THIS ENTIRE BLOCK IS THE CORE CORRECTION ---
    # We use CHARITIES_DATA directly, no string parsing needed.
    other_charities_for_frontend = []
    # Create a list of all charities with just 'name', 'description', 'link' keys
    # This acts as your 'all_charities' list from the old code
    all_formatted_charities = [
        {
            "name": item.get("charity"),
            "description": item.get("description"),
            "link": item.get("donationLink")
        }
        for item in CHARITIES_DATA
    ]

    if matched_name:
        # Filter out the matched charity from the formatted list
        other_charities_for_frontend = [
            c for c in all_formatted_charities if c.get("name") != matched_name
        ]
    else:
        # If AI didn't return a specific match, return all charities.
        # This will include the one that *might* have been matched if AI had picked one.
        other_charities_for_frontend = all_formatted_charities

    return jsonify({
        "choices": chat["choices"],
        "other_charities": other_charities_for_frontend
    })

# ---------- entry‑point -----------------------------------------
# --------
if __name__ == "__main__":
    app.run(debug=True)
