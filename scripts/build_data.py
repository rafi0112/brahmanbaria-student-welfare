"""Turn the Google Form exports in Data/ into public-safe JSON for the Go API.

Outputs (real data, git-ignored):  backend/data/students.json, alumni.json
Output  (synthetic, committed):    backend/data/students.sample.json, alumni.sample.json
Output  (aggregates, git-ignored): backend/data/stats.json

Privacy: phone, email, Facebook, present address, school/college, blood group
and the welfare-problem column are NEVER written to the student/alumni files.
Blood group only contributes to aggregate counts in stats.json.
Run:  python scripts/build_data.py
"""
import glob, hashlib, json, os, random, re
from collections import Counter

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Data")
OUT = os.path.join(ROOT, "backend", "data")

UPAZILAS = {
    "akhaura": ["akhaura", "আখাউড়া"],
    "ashuganj": ["ashuganj", "ashugonj", "আশুগঞ্জ"],
    "bancharampur": ["bancharampur", "banchharampur", "bancharam", "বাঞ্ছারামপুর"],
    "bijoynagar": ["bijoynagar", "bijoy nagar", "bijaynagar", "বিজয়নগর"],
    "sadar": ["sadar", "brahmanbaria sadar", "sodor", "সদর"],
    "kasba": ["kasba", "kosba", "কসবা"],
    "nabinagar": ["nabinagar", "nobinagar", "nobinogor", "nabinogor", "নবীনগর"],
    "nasirnagar": ["nasirnagar", "nasir nagar", "nasirnogor", "নাসিরনগর"],
    "sarail": ["sarail", "shorail", "সরাইল"],
}
DEPTS = [  # (regex, canonical name)
    (r"islamic history", "Islamic History & Culture"), (r"genetic", "Genetic Engineering & Biotechnology"),
    (r"social work|সমাজকর্ম", "Social Work"), (r"আইন", "Law"), (r"sociolog", "Sociology"), (r"fine art", "Fine Arts"),
    (r"modern language|^iml", "Institute of Modern Languages"), (r"^ier$|institute of education", "Institute of Education & Research"),
    (r"^bangla", "Bangla"),
    (r"^(ais|accounting)", "Accounting & Information Systems"),
    (r"management|^mgt|^bba", "Management Studies"),
    (r"^marketing|^mkt", "Marketing"), (r"^finance", "Finance"),
    (r"law and land|law & land", "Law & Land Administration"), (r"(^|\W)law($|\W)", "Law"),
    (r"(^|\W)cse($|\W)|computer science", "Computer Science & Engineering"),
    (r"islamic", "Islamic Studies"), (r"anthropolog", "Anthropology"),
    (r"microbio", "Microbiology"), (r"biochem", "Biochemistry & Molecular Biology"),
    (r"public admin", "Public Administration"), (r"economic", "Economics"),
    (r"english", "English"), (r"history", "History"), (r"philosoph", "Philosophy"),
    (r"statist", "Statistics"), (r"political", "Political Science"),
    (r"mass comm|journalism", "Mass Communication & Journalism"),
    (r"film", "Film & Television"), (r"psycholog", "Psychology"),
    (r"chemistry", "Chemistry"), (r"zoology", "Zoology"), (r"botany", "Botany"),
    (r"pharmacy", "Pharmacy"), (r"theatre", "Theatre"), (r"physics", "Physics"), (r"geograph", "Geography & Environment"), (r"mathemat", "Mathematics"), (r"music", "Music"), (r"3d art", "3D Art & Design"),
]


def clean(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def dept(v):
    s = clean(v).lower()
    for rx, name in DEPTS:
        if re.search(rx, s):
            return name
    return "Other" if len(s) > 2 else ""


def batch_no(*vals):
    for v in vals:
        m = re.search(r"(\d{1,2})", clean(v))
        if m and 1 <= int(m.group(1)) <= 30:
            return int(m.group(1))
    return None


def session(v):
    m = re.search(r"(\d{2,4})\D{1,4}(\d{2,4})", clean(v))
    if not m:
        return ""
    a, b = m.groups()
    a = a if len(a) == 4 else "20" + a
    b = b[-2:]
    return f"{a}-{b}"


def upazila(*vals):
    s = " ".join(clean(v).lower() for v in vals)
    for key, names in UPAZILAS.items():
        if any(n in s for n in names):
            return key
    return ""


def sid(prefix, name, n):
    return prefix + hashlib.sha1(f"{name}{n}".encode()).hexdigest()[:8]


def blocks(path):
    """Yield one list of row-dicts per header row found in the sheet.

    The exports contain several tables stacked in one sheet (alumni, students,
    21st batch), each with its own header row, so columns are mapped per block.
    """
    ws = openpyxl.load_workbook(path, read_only=True).active
    hdr, cur = None, []
    for r in ws.iter_rows(values_only=True):
        cells = [clean(c).lower() for c in r]
        if "timestamp" in cells and "name" in " ".join(cells):
            if cur:
                yield cur
            hdr, cur = cells, []
        elif hdr and any(r):
            cur.append(dict(zip(hdr, r)))
    if cur:
        yield cur


def get(r, *keys):
    for k in r:
        if any(k.startswith(x) for x in keys):
            return r[k]
    return None


def blood_group(v):
    s = clean(v).upper().replace(" ", "").replace("(", "").replace(")", "")
    s = s.replace("POSITIVE", "+").replace("NEGATIVE", "-").replace("+VE", "+").replace("-VE", "-").replace("VE", "")
    return s if re.fullmatch(r"(A|B|AB|O)[+-]", s) else ""


def build_real():
    students, alumni, blood = [], [], Counter()
    seen_s, seen_a = set(), set()
    for f in sorted(glob.glob(os.path.join(DATA, "*.xlsx"))):
        is21 = "21 batch" in os.path.basename(f)
        for block in blocks(f):
            for r in block:
                name = clean(get(r, "name"))
                if len(name) < 4 or name.lower() in ("name", "name (english )"):
                    continue
                bg = blood_group(get(r, "blood group"))
                if "occupation" in r:  # alumni layout
                    if name.lower() in seen_a:
                        continue
                    seen_a.add(name.lower())
                    alumni.append({
                        "id": sid("a", name, len(alumni)), "name": name, "batch": batch_no(get(r, "batch")),
                        "department": dept(get(r, "department")), "occupation": clean(get(r, "occupation")),
                        "workplace": clean(get(r, "work place")), "designation": clean(get(r, "designation")),
                        "upazila": upazila(get(r, "village")),
                    })
                else:  # student layouts
                    if name.lower() in seen_s:
                        continue
                    seen_s.add(name.lower())
                    b = 21 if is21 else batch_no(get(r, "batch"))
                    students.append({
                        "id": sid("s", name, len(students)), "name": name, "batch": b,
                        "department": dept(get(r, "department")), "session": session(get(r, "academic session")),
                        "upazila": upazila(get(r, "permanent address", "upazila and village")),
                    })
                if bg:
                    blood[bg] += 1
    return students, alumni, blood


def build_sample():
    rnd = random.Random(7)
    first = ["Rafiul", "Nusrat", "Tanvir", "Sabrina", "Mehedi", "Farhana", "Ariful", "Sumaiya", "Zahid", "Israt", "Nayeem", "Tasnia", "Shakil", "Mim", "Rakib", "Sadia"]
    last = ["Islam", "Jahan", "Ahmed", "Akter", "Hasan", "Yasmin", "Haque", "Rahman", "Hossain", "Zerin", "Chowdhury", "Sarker"]
    ds = sorted({n for _, n in DEPTS})
    ups = list(UPAZILAS)
    students = []
    for i in range(60):
        b = rnd.randint(10, 21)
        students.append({"id": f"s-sample{i:03d}", "name": f"{rnd.choice(first)} {rnd.choice(last)}", "batch": b,
                         "department": rnd.choice(ds), "session": f"{2009 + b}-{(10 + b) % 100:02d}", "upazila": rnd.choice(ups)})
    jobs = [("Banker", "Sample Bank PLC", "Senior Officer"), ("Lecturer", "Sample University", "Lecturer"),
            ("Software Engineer", "Sample Tech Ltd", "Engineer"), ("Civil Servant", "Sample Ministry", "Assistant Commissioner")]
    alumni = []
    for i in range(24):
        j = rnd.choice(jobs)
        alumni.append({"id": f"a-sample{i:03d}", "name": f"{rnd.choice(first)} {rnd.choice(last)}", "batch": rnd.randint(1, 12),
                       "department": rnd.choice(ds), "occupation": j[0], "workplace": j[1], "designation": j[2], "upazila": rnd.choice(ups)})
    return students, alumni


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    s, a, blood = build_real()
    dump("students.json", s)
    dump("alumni.json", a)
    dump("stats.json", {"blood": dict(blood)})
    ss, sa = build_sample()
    dump("students.sample.json", ss)
    dump("alumni.sample.json", sa)
    print(f"real: {len(s)} students, {len(a)} alumni; sample: {len(ss)}/{len(sa)}")
    print("batches:", sorted(Counter(x["batch"] for x in s if x["batch"]).items()))
    print("no upazila:", sum(1 for x in s if not x["upazila"]), "| no dept:", sum(1 for x in s if not x["department"]))
    print("blood:", dict(blood))
