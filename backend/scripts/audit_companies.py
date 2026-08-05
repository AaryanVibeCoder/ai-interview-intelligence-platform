import json
from pathlib import Path
import sys

# Standard verified attributes for all real companies in the dataset
REAL_COMPANIES_MAP = {
    "Clerk": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "1Password": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "ActiveCampaign": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Behavioral & Coding"},
    "Adobe": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Affirm": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Algorithmic & Behavioral"},
    "Airbnb": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Airtable": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Akamai": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Algolia": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Amazon": {"industry": "Big Tech & E-commerce", "hiring_intensity": "High", "interview_style": "Algorithmic & Behavioral"},
    "Amazon SES": {"industry": "Cloud Infrastructure", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "AMD": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Amplitude": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Anthropic": {"industry": "Artificial Intelligence", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Apple": {"industry": "Big Tech & Consumer Electronics", "hiring_intensity": "High", "interview_style": "Algorithmic & Domain Specific"},
    "Aqua Security": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Arc Browser": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "ASML": {"industry": "Hardware & Semiconductors", "hiring_intensity": "High", "interview_style": "Domain Specific"},
    "Atlassian": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Auth0": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Authress": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Autodesk": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Bamboo": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Behavioral & Coding"},
    "BigCommerce": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Bitbucket": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Box": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Brex": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Broadcom": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Buy Me a Coffee": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Bytebase": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Canva": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Cart.com": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & System Design"},
    "Carta": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Checkmarx": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Domain Specific & Algorithmic"},
    "Chime": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Algorithmic & Behavioral"},
    "CircleCI": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & System Design"},
    "Cisco": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Cloudflare": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Cohere": {"industry": "Artificial Intelligence", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Coinbase": {"industry": "Web3 & Blockchain", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Confluent": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "ConvertKit": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Crunchbase": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Dashlane": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Databricks": {"industry": "Data & Analytics", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Datadog": {"industry": "DevOps & Developer Tools", "hiring_intensity": "High", "interview_style": "System Design & Practical"},
    "Deel": {"industry": "Software & SaaS", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Dell": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Descript": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Dev.to": {"industry": "Social Media & Comm", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "DigitalOcean": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Docker": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "DoorDash": {"industry": "Logistics & Delivery", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "Dropbox": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Dynatrace": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Elastic": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "F5": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "Domain Specific & Algorithmic"},
    "Fastly": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Fathom": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Figma": {"industry": "Software & SaaS", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Fly.io": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Flywheel": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Ghost": {"industry": "Software & SaaS", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "GitHub": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "GitHub Actions": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "GitLab": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "GitLab CI": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Gong": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Google": {"industry": "Big Tech", "hiring_intensity": "High", "interview_style": "Algorithmic & Behavioral"},
    "Gumroad": {"industry": "E-commerce", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Gusto": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "HackerNews": {"industry": "Social Media & Comm", "hiring_intensity": "Low", "interview_style": "Behavioral & Coding"},
    "Harness": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "HashiCorp": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Hashnode": {"industry": "Software & SaaS", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Heroku": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "HP": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "HubSpot": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Hugging Face": {"industry": "Artificial Intelligence", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "IBM": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Behavioral & Coding"},
    "Instacart": {"industry": "Logistics & Delivery", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "Intel": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Jasper AI": {"industry": "Artificial Intelligence", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Jenkins": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Klarna": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Algorithmic & Behavioral"},
    "Ko-fi": {"industry": "Fintech", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Kraken": {"industry": "Web3 & Blockchain", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Lacework": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "LastPass": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "LaunchDarkly": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Linear": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Linode": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "LogRocket": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Loom": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Lyft": {"industry": "Logistics & Delivery", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "Magento": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Mailchimp": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Mailgun": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Marqeta": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Scale"},
    "Medium": {"industry": "Social Media & Comm", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Meta": {"industry": "Big Tech", "hiring_intensity": "High", "interview_style": "Algorithmic & Behavioral"},
    "Micron": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Microsoft": {"industry": "Big Tech", "hiring_intensity": "High", "interview_style": "Algorithmic & System Design"},
    "Midjourney": {"industry": "Artificial Intelligence", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Miro": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Mixpanel": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "MongoDB": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Algorithmic & Scale"},
    "Monzo": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Neon": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Scale"},
    "NetApp": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Netflix": {"industry": "Entertainment & Tech", "hiring_intensity": "High", "interview_style": "System Design & Culture Fit"},
    "Netlify": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & System Design"},
    "New Relic": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "NordPass": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Notion": {"industry": "Software & SaaS", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Nvidia": {"industry": "Hardware & Semiconductors", "hiring_intensity": "High", "interview_style": "Domain Specific & C++"},
    "Octopus Deploy": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Okta": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "OpenAI": {"industry": "Artificial Intelligence", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Optimizely": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Oracle": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Orca Security": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "PagerDuty": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Palantir": {"industry": "Software & SaaS", "hiring_intensity": "High", "interview_style": "Algorithmic & System Design"},
    "Patreon": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "PitchBook": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "PlanetScale": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Scale"},
    "Plausible": {"industry": "Data & Analytics", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Postman": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Postmark": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Printful": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Printify": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Product Hunt": {"industry": "Social Media & Comm", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Proton": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Qualcomm": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Railway": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Ramp": {"industry": "Fintech", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Raycast": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Remote": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Render": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Resend": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Retool": {"industry": "DevOps & Developer Tools", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Revolut": {"industry": "Fintech", "hiring_intensity": "High", "interview_style": "Algorithmic & Behavioral"},
    "Rippling": {"industry": "Software & SaaS", "hiring_intensity": "High", "interview_style": "Practical & Scale"},
    "Robinhood": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Runway": {"industry": "Artificial Intelligence", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Salesforce": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "SAP": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Behavioral & Coding"},
    "Scale AI": {"industry": "Artificial Intelligence", "hiring_intensity": "High", "interview_style": "Practical & Algorithmic"},
    "Segment": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Sendgrid": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Sentry": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "ServiceNow": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Shopify": {"industry": "E-commerce", "hiring_intensity": "High", "interview_style": "Practical & System Design"},
    "Signal": {"industry": "Social Media & Comm", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Simple Analytics": {"industry": "Data & Analytics", "hiring_intensity": "Low", "interview_style": "Practical & Algorithmic"},
    "Snowflake": {"industry": "Data & Analytics", "hiring_intensity": "High", "interview_style": "Algorithmic & Scale"},
    "Snyk": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "SoFi": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "SonarQube": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "SpaceX": {"industry": "Hardware & Semiconductors", "hiring_intensity": "High", "interview_style": "Domain Specific"},
    "SparkPost": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Split.io": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Splunk": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Squarespace": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Statsig": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Stripe": {"industry": "Fintech", "hiring_intensity": "High", "interview_style": "Practical & Architectural"},
    "Substack": {"industry": "Social Media & Comm", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Supabase": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Synopsys": {"industry": "Hardware & Semiconductors", "hiring_intensity": "Medium", "interview_style": "Domain Specific"},
    "Sysdig": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Talon Cyber": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "TeamCity": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Teespring": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Telegram": {"industry": "Social Media & Comm", "hiring_intensity": "High", "interview_style": "Algorithmic & Scale"},
    "Toast": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Travis CI": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "TSMC": {"industry": "Hardware & Semiconductors", "hiring_intensity": "High", "interview_style": "Domain Specific"},
    "Twilio": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "Twilio SendGrid": {"industry": "DevOps & Developer Tools", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Uber": {"industry": "Logistics & Delivery", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "Veracode": {"industry": "Cybersecurity", "hiring_intensity": "Medium", "interview_style": "Practical & Security"},
    "Vercel": {"industry": "Cloud Infrastructure", "hiring_intensity": "High", "interview_style": "Practical & Scale"},
    "VMware": {"industry": "Cloud Infrastructure", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Webflow": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Architectural"},
    "WhatsApp": {"industry": "Social Media & Comm", "hiring_intensity": "High", "interview_style": "System Design & Scale"},
    "Wise": {"industry": "Fintech", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Wix": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & System Design"},
    "Wiz": {"industry": "Cybersecurity", "hiring_intensity": "High", "interview_style": "Practical & Security"},
    "WooCommerce": {"industry": "E-commerce", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "WordPress": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"},
    "Workday": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "Coding & System Design"},
    "Zapier": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "System Design & Practical"},
    "Zoom": {"industry": "Software & SaaS", "hiring_intensity": "Medium", "interview_style": "System Design & Scale"},
    "Zoom Info": {"industry": "Data & Analytics", "hiring_intensity": "Medium", "interview_style": "Practical & Algorithmic"}
}

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    backend_path = Path(__file__).parent / "../app/api/companies.json"
    frontend_path = Path(__file__).parent / "../../frontend/src/features/interview/components/companies.json"
    
    if not backend_path.exists():
        print(f"Error: Backend companies.json not found at {backend_path}")
        sys.exit(1)
        
    data = load_json(backend_path)
    
    mismatches = []
    corrected_entries = []
    
    # Track statistics
    total_count = len(data)
    corrected_count = 0
    fictional_count = 0
    
    for item in data:
        # Full whitespace sweep on name and string values
        name = item.get("name", "").strip()
        industry = item.get("industry", "").strip()
        hiring_intensity = item.get("hiring_intensity", "").strip()
        interview_style = item.get("interview_style", "").strip()
        avg_questions = item.get("avg_questions", 5)
        
        # Verify
        if name in REAL_COMPANIES_MAP:
            correct = REAL_COMPANIES_MAP[name]
            
            # Check for mismatches
            item_mismatches = {}
            if industry != correct["industry"]:
                item_mismatches["industry"] = {"current": industry, "corrected": correct["industry"]}
            if hiring_intensity != correct["hiring_intensity"]:
                item_mismatches["hiring_intensity"] = {"current": hiring_intensity, "corrected": correct["hiring_intensity"]}
            if interview_style != correct["interview_style"]:
                item_mismatches["interview_style"] = {"current": interview_style, "corrected": correct["interview_style"]}
                
            if item_mismatches:
                mismatches.append({
                    "company_name": name,
                    "mismatches": item_mismatches
                })
                corrected_count += 1
                
            # Create corrected entry
            corrected_item = {
                "name": name,
                "industry": correct["industry"],
                "hiring_intensity": correct["hiring_intensity"],
                "interview_style": correct["interview_style"],
                "avg_questions": avg_questions,
                "needs_review": False
            }
        else:
            # Fictional company - flag as needs_review: True
            corrected_item = {
                "name": name,
                "industry": industry,
                "hiring_intensity": hiring_intensity,
                "interview_style": interview_style,
                "avg_questions": avg_questions,
                "needs_review": True
            }
            fictional_count += 1
            
        corrected_entries.append(corrected_item)
        
    # Write the main audit report json to disk
    report_path = Path(__file__).parent / "../audit-report.json"
    report_data = {
        "mismatches_found": mismatches,
        "corrected_entries": corrected_entries
    }
    write_json(report_path, report_data)
    
    # Save the updated files directly to backend and frontend paths
    write_json(backend_path, corrected_entries)
    if frontend_path.exists():
        write_json(frontend_path, corrected_entries)
        print("Successfully updated frontend companies.json")
    else:
        print(f"Warning: Frontend companies.json not found at {frontend_path}")
        
    # Standard output summary
    print("=" * 60)
    print("                  ELEVATEIQ COMPANY DATA AUDIT                  ")
    print("=" * 60)
    print(f"Total Companies Evaluated:   {total_count}")
    print(f"Mismatches Corrected:       {corrected_count}")
    print(f"Fictional Companies Flagged: {fictional_count}")
    print("-" * 60)
    print(f"Audit Report Written to:    {report_path.resolve()}")
    print(f"Backend JSON Updated at:    {backend_path.resolve()}")
    print("=" * 60)

if __name__ == "__main__":
    main()
