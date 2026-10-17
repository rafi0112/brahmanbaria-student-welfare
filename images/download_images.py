#!/usr/bin/env python3
"""
Download a starter pack of Wikimedia Commons images related to Brahmanbaria,
Bangladesh, and save attribution/licensing metadata.

Run:
  python download_images.py
Optional:
  python download_images.py --limit 30

Images are fetched from Wikimedia Commons at runtime. Each image's licence varies;
review attribution.csv before publishing on a website.
"""
import argparse
import csv
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import json

API = "https://commons.wikimedia.org/w/api.php"
CATEGORIES = [
    "Category:Brahmanbaria",
    "Category:Nature of Brahmanbaria District",
    "Category:Sunsets of Brahmanbaria District",
    "Category:Brahmanbaria District",
]

def api_get(params):
    params = dict(params)
    params.update({"format": "json", "origin": "*"})
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "BrahmanbariaImagePack/1.0 (personal website asset collection)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def clean_name(name):
    name = name.replace("File:", "")
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    return name[:180]

def category_files(category, seen):
    cont = {}
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "file",
            "cmlimit": "100",
            "cmprop": "title|type",
        }
        params.update(cont)
        data = api_get(params)
        for item in data.get("query", {}).get("categorymembers", []):
            title = item.get("title")
            if title and title not in seen:
                seen.add(title)
                yield title
        cont = data.get("continue", {})
        if not cont:
            break

def get_metadata(title):
    data = api_get({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "1280",
    })
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        def val(k):
            v = meta.get(k, {}).get("value", "")
            return re.sub("<[^>]+>", "", str(v)).strip()
        return {
            "title": title,
            "url": info.get("thumburl") or info.get("url", ""),  # thumbnail: Wikimedia asks bots not to fetch originals
            "description": val("ImageDescription"),
            "artist": val("Artist"),
            "license": val("LicenseShortName"),
            "license_url": val("LicenseUrl"),
            "credit": val("Credit"),
            "source_page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
        }
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--output", default="brahmanbaria_images")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    seen, titles = set(), []
    for cat in CATEGORIES:
        try:
            for title in category_files(cat, seen):
                titles.append(title)
                if len(titles) >= args.limit:
                    break
        except Exception as e:
            print(f"Warning: could not read {cat}: {e}")
        if len(titles) >= args.limit:
            break

    rows = []
    for i, title in enumerate(titles, 1):
        try:
            meta = get_metadata(title)
            if not meta or not meta.get("url"):
                continue
            filename = f"{i:02d}_{clean_name(title)}"
            path = os.path.join(args.output, filename)
            req = urllib.request.Request(meta["url"], headers={"User-Agent": "BrahmanbariaImagePack/1.0"})
            for attempt in range(5):  # back off politely on HTTP 429
                try:
                    with urllib.request.urlopen(req, timeout=60) as response:
                        data = response.read()
                    break
                except urllib.error.HTTPError as err:
                    if err.code != 429 or attempt == 4:
                        raise
                    time.sleep(10 * (attempt + 1))
            with open(path, "wb") as f:
                f.write(data)
            meta["downloaded_filename"] = filename
            rows.append(meta)
            print(f"[{len(rows)}] Downloaded: {filename}")
            time.sleep(2)
        except Exception as e:
            print(f"Skipped {title}: {e}")

    csv_path = os.path.join(args.output, "attribution.csv")
    fields = ["downloaded_filename", "title", "description", "artist", "license", "license_url", "credit", "source_page", "url"]
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    with open(os.path.join(args.output, "README.txt"), "w", encoding="utf-8") as f:
        f.write(
            "BRAHMANBARIA IMAGE STARTER PACK\\n\\n"
            f"Downloaded {len(rows)} images from Wikimedia Commons.\\n"
            "Check attribution.csv and each source page before publishing.\\n"
            "Licences vary by image; some require attribution and/or ShareAlike.\\n"
            "Do not assume all images are public domain. Verify each file's licence.\\n"
        )
    print(f"\\nFinished: {len(rows)} images saved to ./{args.output}/")
    print(f"Attribution list: ./{args.output}/attribution.csv")

if __name__ == "__main__":
    main()
