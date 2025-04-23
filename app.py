# app.py ----------------------------------------------------------
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS          # still handy if you later split front/back
from dotenv import load_dotenv
import os, requests
import re

# ---------- env --------------------------------------------------
load_dotenv()
API_KEY = os.getenv("TOGETHER_API_KEY")
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
    return send_from_directory(".", "index.html")

# ---------- API route -------------------------------------------
CHARITIES = "# List of Charities\n\n" \
    + "### Embrace the Middle East\n" \
    + "- **Type**: Humanitarian Aid, Education, Healthcare\n" \
    + "- **Impact**: This charity works to support marginalized and vulnerable communities across the Middle East, providing humanitarian aid, education, and healthcare. Their projects focus on long-term solutions to poverty and injustice, empowering local communities through sustainable programs. With an ecumenical Christian foundation, they partner with local organizations to promote dignity and hope.\n" \
    + "[Donation Page](https://embraceme.org/donate)\n\n" \
    + "### Alliance for Middle East Peace (ALLMEP)\n" \
    + "- **Type**: Peacebuilding\n" \
    + "- **Impact**: ALLMEP is a coalition of over 160 organizations dedicated to peacebuilding between Israelis and Palestinians. By supporting grassroots initiatives, they promote dialogue, cooperation, and mutual understanding to build a more peaceful future. They also advocate for international support to expand their conflict-resolution efforts.\n" \
    + "[Donation Page](https://www.allmep.org/donate/)\n\n" \
    + "### American Near East Refugee Aid (Anera)\n" \
    + "- **Type**: Humanitarian Aid, Education, Health\n" \
    + "- **Impact**: Anera delivers vital programs to alleviate poverty and suffering in the Middle East, focusing on education, health, and economic development. They provide medical aid, vocational training, and emergency relief to communities affected by conflict. Their initiatives create sustainable opportunities, particularly for refugees and vulnerable populations.\n" \
    + "[Donation Page](https://www.anera.org/donate/)\n\n" \
    + "### Disasters Emergency Committee (DEC) – Middle East Humanitarian Appeal\n" \
    + "- **Type**: Emergency Relief\n" \
    + "- **Impact**: DEC coordinates emergency relief efforts for humanitarian crises in Gaza, Lebanon, and the West Bank. Their aid includes food, clean water, and medical assistance to communities impacted by conflict and displacement. They bring together multiple charities to ensure rapid and effective disaster response.\n" \
    + "[Donation Page](https://www.dec.org.uk/appeal/middle-east-humanitarian-appeal)\n\n" \
    + "### Bill & Melinda Gates Foundation – Middle East Initiatives\n" \
    + "- **Type**: Health, Poverty Alleviation, Agricultural Development\n" \
    + "- **Impact**: This foundation partners with organizations in the Middle East to address critical issues such as healthcare, poverty, and agricultural development. Their initiatives focus on reducing preventable diseases, improving education, and fostering economic growth. By funding innovative solutions, they aim to create lasting change in struggling communities.\n" \
    + "[Donation Page](https://www.gatesfoundation.org/)\n\n" \
    + "### World Food Programme (WFP)\n" \
    + "- **Type**: Food Assistance\n" \
    + "- **Impact**: WFP provides food assistance to vulnerable populations across the Middle East, tackling hunger and malnutrition. Their programs deliver emergency food supplies while also supporting sustainable solutions for food security. Through partnerships with local governments and organizations, they help communities build resilience against food crises.\n" \
    + "[Donation Page](https://www.wfp.org/donate)\n\n" \
    + "### UNICEF\n" \
    + "- **Type**: Child Protection, Education, Health\n" \
    + "- **Impact**: UNICEF works to protect children across the Middle East by providing education, healthcare, and humanitarian aid. Their programs focus on immunizations, clean water, nutrition, and emergency relief for children affected by war and poverty. They advocate for children's rights and ensure access to essential services in crisis-affected regions.\n" \
    + "[Donation Page](https://www.unicef.org/)\n\n" \
    + "### CARE\n" \
    + "- **Type**: Humanitarian Aid\n" \
    + "- **Impact**: CARE delivers both immediate relief and long-term development programs in the Middle East, focusing on food security, education, and women's empowerment. Their work helps families rebuild their lives after conflict and displacement. They also provide economic opportunities for women to support self-sufficiency and social stability.\n" \
    + "[Donation Page](https://www.care.org/)\n\n" \
    + "### Islamic Relief USA\n" \
    + "- **Type**: Humanitarian Aid (Food aid, clean water, healthcare, education, livelihood support)\n" \
    + "- **Impact**: Islamic Relief USA provides comprehensive humanitarian aid across the Middle East, including emergency relief, healthcare, clean water, and education. Their projects focus on both immediate assistance and long-term development, helping communities recover from crises. They also support livelihood programs to foster self-reliance.\n" \
    + "[Donation Page](https://irusa.org/middle-east/)\n\n" \
    + "### Middle East Children's Alliance (MECA)\n" \
    + "- **Type**: Medical and Educational Support\n" \
    + "- **Impact**: MECA delivers medical aid and supports community projects that improve the lives of Palestinian children and refugees from Syria. Their work includes providing educational resources, clean water initiatives, and trauma relief programs. They focus on empowering children and families to rebuild their futures.\n" \
    + "[Donation Page](https://www.mecaforpeace.org/)\n\n" \
    + "### Palestine Children's Relief Fund (PCRF)\n" \
    + "- **Type**: Medical Aid\n" \
    + "- **Impact**: PCRF provides life-saving medical care to children in the Middle East, including those in the West Bank and Gaza. They arrange free surgeries and medical treatments for children in need, regardless of nationality or religion. Their long-term projects include building pediatric cancer centers to improve healthcare access.\n" \
    + "[Donation Page](https://www.pcrf.net/)\n\n" \
    + "### United Nations Relief and Works Agency for Palestine Refugees (UNRWA)\n" \
    + "- **Type**: Humanitarian Aid (Food assistance, education, healthcare)\n" \
    + "- **Impact**: UNRWA provides essential services such as food, education, and healthcare to Palestinian refugees across the Middle East. They support millions of people in Gaza, the West Bank, Lebanon, Syria, and Jordan. Their work ensures that displaced communities have access to basic human rights and opportunities for a better future.\n" \
    + "[Donation Page](https://donate.unrwa.org/int/en/general)\n\n" \
    + "### Project HOPE\n" \
    + "- **Type**: Medical Aid\n" \
    + "- **Impact**: Project HOPE strengthens health systems and provides emergency medical aid in the Middle East and North Africa. Their work includes training healthcare workers, delivering life-saving medicines, and responding to humanitarian crises. They focus on long-term health solutions to build stronger communities.\n" \
    + "[Donation Page](https://www.projecthope.org/region/middle-east-north-africa/)\n\n" \
    + "### Médecins Sans Frontières (Doctors Without Borders)\n" \
    + "- **Type**: Medical Aid\n" \
    + "- **Impact**: Doctors Without Borders provides emergency medical care in conflict zones across the Middle East, including Syria, Yemen, and Iraq. Their teams offer surgical care, maternal health services, and treatment for malnutrition and disease outbreaks. They operate independently, ensuring aid reaches those most in need.\n" \
    + "[Donation Page](https://www.msf.org/donate)\n\n" \
    + "### International Rescue Committee (IRC)\n" \
    + "- **Type**: Humanitarian Aid\n" \
    + "- **Impact**: IRC provides life-saving healthcare, child protection, and emergency relief to people affected by war and displacement in the Middle East. Their programs help rebuild communities by offering job training, education, and economic support. They focus on both immediate humanitarian assistance and long-term stability.\n" \
    + "[Donation Page](https://www.rescue.org/donate)\n\n" \
    + "### Save the Children\n" \
    + "- **Type**: Child Protection, Education, and Health\n" \
    + "- **Impact**: Save the Children delivers education, healthcare, and emergency relief to children affected by conflict in the Middle East. Their programs focus on ensuring access to learning, nutrition, and psychological support for children in crisis. They advocate for children's rights and work to create a brighter future for vulnerable youth.\n" \
    + "[Donation Page](https://www.savethechildren.org/us/what-we-do/where-we-work/greater-middle-east-eurasia)\n\n" \
    + "### Action Against Hunger\n" \
    + "- **Type**: Food Security and Nutrition\n" \
    + "- **Impact**: Action Against Hunger combats food insecurity and malnutrition in the Middle East by providing emergency food aid and sustainable farming solutions. Their projects include distributing food parcels and supporting communities in developing long-term food production. They focus on addressing the root causes of hunger and building resilience.\n" \
    + "[Donation Page](https://www.actionagainsthunger.org/donate)\n\n" \
    + "### Mahak Society to Support Children with Cancer\n" \
    + "- **Type**: Pediatric Cancer Support\n" \
    + "- **Impact**: Mahak is one of the most respected nonprofit organizations in Iran, dedicated to supporting children with cancer and their families. They provide high-quality treatment, emotional support, and financial assistance. Their state-of-the-art hospital in Tehran is internationally accredited and offers comprehensive care regardless of financial status.\n" \
    + "[Donation Page](https://www.mahak-charity.org/main/index.php/en/how-to-help/donate-online)\n\n" \
    + "### Imam Ali's Popular Students Relief Society\n" \
    + "- **Type**: Poverty Alleviation and Social Support\n" \
    + "- **Impact**: A grassroots, student-led charity organization in Iran that helps children and families living in poverty. Their initiatives range from education and healthcare to emergency housing and psychological support. The group is known for its community-based development model and long-term commitment to vulnerable populations.\n" \
    + "[Donation Page](https://www.sosapoverty.org/en/)\n\n" \
    + "### Persian Wildlife Foundation\n" \
    + "- **Type**: Environmental Conservation\n" \
    + "- **Impact**: The Persian Wildlife Foundation works to preserve Iran’s natural heritage through research, education, and conservation projects. They focus on endangered species, environmental education, and supporting local communities in sustainable development. Their efforts help protect Iran's unique biodiversity and natural ecosystems.\n" \
    + "[Donation Page](https://www.persianwildlife.org/)\n\n" \
    + "### Children of Persia\n" \
    + "- **Type**: Child Welfare and Education\n" \
    + "- **Impact**: Children of Persia is a U.S.-based nonprofit that supports health, education, and welfare projects for children in Iran. They fund surgeries, distribute school supplies, and provide financial assistance to families in need. Their goal is to offer opportunities for children to live healthier, more dignified lives.\n" \
    + "[Donation Page](https://www.childrenofpersia.org/donate/)"

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
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)