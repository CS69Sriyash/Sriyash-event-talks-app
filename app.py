import re
import html
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# Constants
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
NAMESPACE = {'atom': 'http://www.w3.org/2005/Atom'}

def clean_html_for_tweet(html_str):
    """Cleans HTML to create a neat, readable plain text for Twitter/X sharing."""
    # Convert list items to bullets
    text = re.sub(r'<li>', '• ', html_str)
    # Convert links to text with URL in parentheses, but skip relative urls or clean them
    text = re.sub(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', r'\2 (\1)', text)
    # Remove remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities (like &amp; or &gt;)
    text = html.unescape(text)
    # Replace multiple whitespaces/newlines with a single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_and_parse_feed():
    """Fetches the Google Cloud BigQuery release notes Atom feed and parses it."""
    req = urllib.request.Request(FEED_URL, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    with urllib.request.urlopen(req, timeout=10) as response:
        xml_data = response.read()
        
    root = ET.fromstring(xml_data)
    
    all_notes = []
    
    for entry in root.findall('atom:entry', NAMESPACE):
        date_str = entry.find('atom:title', NAMESPACE).text
        updated = entry.find('atom:updated', NAMESPACE).text
        
        # Extract the alternate link (pointing to the release notes website)
        link = ""
        for link_node in entry.findall('atom:link', NAMESPACE):
            if link_node.attrib.get('rel') == 'alternate':
                link = link_node.attrib.get('href', '')
                break
                
        content_elem = entry.find('atom:content', NAMESPACE)
        content_html = content_elem.text if content_elem is not None else ""
        
        # Split the HTML content by h3 elements to extract individual updates
        pattern = r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)'
        matches = re.findall(pattern, content_html, re.DOTALL | re.IGNORECASE)
        
        if not matches:
            # Fallback if no <h3> tags are found
            note_id = f"bq_{date_str.replace(' ', '_').replace(',', '')}_0"
            clean_text = clean_html_for_tweet(content_html)
            all_notes.append({
                "id": note_id,
                "date": date_str,
                "type": "Update",
                "content_html": content_html,
                "tweet_text": f"BigQuery Update [{date_str}]: {clean_text}",
                "link": link
            })
        else:
            for idx, (note_type, note_content) in enumerate(matches):
                note_type = note_type.strip()
                note_content = note_content.strip()
                note_id = f"bq_{date_str.replace(' ', '_').replace(',', '')}_{idx}"
                clean_text = clean_html_for_tweet(note_content)
                
                # Truncate content for a cleaner short version in the tweet text
                short_text = clean_text
                if len(short_text) > 160:
                    short_text = short_text[:157] + "..."
                
                tweet_text = f"BigQuery Update [{date_str}] - {note_type}:\n{short_text}\n\nRead more:"
                
                all_notes.append({
                    "id": note_id,
                    "date": date_str,
                    "type": note_type,
                    "content_html": f"<h3>{note_type}</h3>{note_content}",
                    "tweet_text": tweet_text,
                    "link": link
                })
                
    return all_notes

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        notes = fetch_and_parse_feed()
        return jsonify({
            "status": "success",
            "count": len(notes),
            "data": notes
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
