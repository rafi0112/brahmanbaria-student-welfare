"""Turn the Google Form exports in Data/ into public-safe JSON for the Go API.

Outputs (real data, git-ignored):  backend/data/students.json, alumni.json
Output  (everything, git-ignored): backend/data/records_full.json: every record with the private columns and the
                                   original form rows, for `go run . import-directory` (Supabase is then the source)
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
OUT = os.environ.get("BSWA_OUT") or os.path.join(ROOT, "backend", "data")

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


JUNK = {"none", "n/a", "na", "no", "nil", "not yet", "-", ".", "null", "currently not working", "not working"}


def job(v):
    s = clean(v)
    return "" if s.lower().strip(" .") in JUNK else s


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


def norm_name(n):
    s = re.sub(r"[^a-z0-9 ]", " ", n.lower())
    return " ".join(w for w in s.split() if w not in ("md", "mohammad", "muhammad", "mst"))


FIELD = re.compile(r"^(Dept|Batch|Session|Mobile|Address|Blood Group|Blood|Workplace|Designation|Occupation):\s*(.*)$")


def pdf_records(path):
    """Parse the batch directory PDFs into one dict per '#NNN' entry.

    Values can wrap over several lines, so continuation lines are appended to
    the previous field. Section headings such as '17th Batch' are ignored.
    """
    import pypdf
    lines = []
    for page in pypdf.PdfReader(path).pages:
        lines += [clean(x) for x in (page.extract_text() or "").splitlines()]
    recs, cur, field = [], None, None
    for ln in lines:
        if not ln:
            continue
        if re.fullmatch(r"#\d{3}", ln):
            cur = {"_n": ln, "name": ""}
            recs.append(cur)
            field = "name"
            continue
        if cur is None or ln == "No Photo" or re.fullmatch(r"\d+(st|nd|rd|th) Batch", ln):
            continue
        m = FIELD.match(ln)
        if m:
            field = m.group(1).lower().replace("blood group", "blood")
            cur[field] = (cur.get(field, "") + " " + m.group(2)).strip()
        elif field:
            cur[field] = (cur.get(field, "") + " " + ln).strip()
    return recs


def raw_row(r):
    """The original form row as header -> text, empty cells left out."""
    return {clean(k) or f"column {i + 1}": clean(v) for i, (k, v) in enumerate(r.items()) if clean(v)}


def private_from_row(r):
    pick = lambda *keys: clean(get(r, *keys))
    return {
        "phone": pick("mobile"), "email": pick("email"), "bloodGroup": blood_group(get(r, "blood")),
        "permanentAddress": pick("permanent address", "upazila and village", "village"), "presentAddress": pick("present address"),
        "school": pick("school"), "college": pick("college"), "facebook": pick("facebook"),
        "photoLink": pick("picture", "photo"), "note": pick("you may inform", "column 10"),
    }


def private_from_pdf(r):
    return {"phone": clean(r.get("mobile")), "bloodGroup": blood_group(r.get("blood")), "permanentAddress": clean(r.get("address"))}


def remember(full, rec, kind, src, private, raw):
    """Keep the private columns and every source row of one record; later sources only fill blanks."""
    e = full.setdefault(rec["id"], {"kind": kind, "private": {}, "sources": []})
    for k, v in private.items():
        if v and not e["private"].get(k):
            e["private"][k] = v
    e["sources"].append({"file": src, "row": raw})


def batch_from_session(sess):
    m = re.match(r"(\d{4})-", sess or "")
    return int(m.group(1)) - 2004 if m else None


def add_pdf_people(students, alumni, blood, seen_s, seen_a, full=None):
    """Merge the batch PDFs: add people missing from the sheets and fill blank fields of known ones.

    Returns (new students, new alumni, filled field count, (batch==session-2004 agreements, checked)).
    """
    ns = na = filled = agree = checked = 0
    by_s = {norm_name(x["name"]): x for x in students}
    by_a = {norm_name(x["name"]): x for x in alumni}
    for fname, kind in (("1 to 15 Batch .pdf", "alumni"), ("16 to 21 Batch .pdf", "student")):
        path = os.path.join(DATA, fname)
        if not os.path.exists(path):
            continue
        for r in pdf_records(path):
            name = clean(r.get("name"))
            key = norm_name(name)
            if len(key) < 3:
                continue
            sess = session(r.get("session"))
            rb = batch_no(r.get("batch"))
            if kind == "student" and rb and batch_from_session(sess):
                checked += 1
                agree += rb == batch_from_session(sess)
            new = {
                "batch": rb,
                "department": dept(r.get("dept")), "session": sess, "upazila": upazila(r.get("address")),
                "occupation": job(r.get("occupation")), "workplace": job(r.get("workplace")), "designation": job(r.get("designation")),
            }
            known = (by_a if kind == "alumni" else by_s).get(key)
            if known is not None:
                for k, v in new.items():
                    if k in known and v and (known[k] in ("", None, "Other")):
                        known[k] = v
                        filled += 1
                if full is not None:
                    remember(full, known, kind, fname, private_from_pdf(r), {k: clean(v) for k, v in r.items() if clean(v)})
                continue
            if kind == "alumni":
                rec = {"id": sid("a", name, len(alumni)), "name": name, **{k: new[k] for k in ("batch", "department", "occupation", "workplace", "designation", "upazila")}}
                alumni.append(rec); by_a[key] = rec; seen_a.add(key); na += 1
                if full is not None:
                    remember(full, rec, kind, fname, private_from_pdf(r), {k: clean(v) for k, v in r.items() if clean(v)})
            else:
                rec = {"id": sid("s", name, len(students)), "name": name, **{k: new[k] for k in ("batch", "department", "session", "upazila")}}
                students.append(rec); by_s[key] = rec; seen_s.add(key); ns += 1
                if full is not None:
                    remember(full, rec, kind, fname, private_from_pdf(r), {k: clean(v) for k, v in r.items() if clean(v)})
            bg = blood_group(r.get("blood"))
            if bg:
                blood[bg] += 1
    return ns, na, filled, (agree, checked)


def build_real(full=None):
    students, alumni, blood = [], [], Counter()
    seen_s, seen_a = set(), set()
    by_name_s, by_name_a = {}, {}
    for f in sorted(glob.glob(os.path.join(DATA, "*.xlsx"))):
        is21 = "21 batch" in os.path.basename(f)
        for block in blocks(f):
            for r in block:
                name = clean(get(r, "name"))
                if len(name) < 4 or name.lower() in ("name", "name (english )"):
                    continue
                bg = blood_group(get(r, "blood group"))
                src = os.path.basename(f)
                if "occupation" in r:  # alumni layout
                    if norm_name(name) in seen_a:
                        if full is not None and norm_name(name) in by_name_a:
                            remember(full, by_name_a[norm_name(name)], "alumni", src, private_from_row(r), raw_row(r))
                        continue
                    seen_a.add(norm_name(name))
                    alumni.append({
                        "id": sid("a", name, len(alumni)), "name": name, "batch": batch_no(get(r, "batch")),
                        "department": dept(get(r, "department")), "occupation": job(get(r, "occupation")),
                        "workplace": job(get(r, "work place")), "designation": job(get(r, "designation")),
                        "upazila": upazila(get(r, "village")),
                    })
                    by_name_a[norm_name(name)] = alumni[-1]
                    if full is not None:
                        remember(full, alumni[-1], "alumni", src, private_from_row(r), raw_row(r))
                else:  # student layouts
                    if norm_name(name) in seen_s:
                        if full is not None and norm_name(name) in by_name_s:
                            remember(full, by_name_s[norm_name(name)], "student", src, private_from_row(r), raw_row(r))
                        continue
                    seen_s.add(norm_name(name))
                    b = 21 if is21 else batch_no(get(r, "batch"))
                    students.append({
                        "id": sid("s", name, len(students)), "name": name, "batch": b,
                        "department": dept(get(r, "department")), "session": session(get(r, "academic session")),
                        "upazila": upazila(get(r, "permanent address", "upazila and village")),
                    })
                    by_name_s[norm_name(name)] = students[-1]
                    if full is not None:
                        remember(full, students[-1], "student", src, private_from_row(r), raw_row(r))
                if bg:
                    blood[bg] += 1
    ns, na, filled, agree = add_pdf_people(students, alumni, blood, seen_s, seen_a, full)
    print(f"from PDFs: +{ns} students, +{na} alumni, {filled} blank fields filled; batch==session-2004 on {agree[0]}/{agree[1]} records that list both")
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
    full = {}
    s, a, blood = build_real(full)
    dump("students.json", s)
    dump("alumni.json", a)
    dump("records_full.json", {
        "students": [{**x, **full.get(x["id"], {"private": {}, "sources": []})} for x in s],
        "alumni": [{**x, **full.get(x["id"], {"private": {}, "sources": []})} for x in a],
    })
    dump("stats.json", {"blood": dict(blood)})
    ss, sa = build_sample()
    dump("students.sample.json", ss)
    dump("alumni.sample.json", sa)
    print(f"real: {len(s)} students, {len(a)} alumni; sample: {len(ss)}/{len(sa)}")
    print("batches:", sorted(Counter(x["batch"] for x in s if x["batch"]).items()))
    print("no upazila:", sum(1 for x in s if not x["upazila"]), "| no dept:", sum(1 for x in s if not x["department"]))
    print("blood:", dict(blood))
