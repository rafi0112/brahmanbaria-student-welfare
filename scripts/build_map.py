"""Build frontend/src/data/map.json from geoBoundaries BGD ADM3 (CC BY 4.0).

Usage: python scripts/build_map.py path/to/geoBoundaries-BGD-ADM3_simplified.geojson
Source: https://www.geoboundaries.org  (Runfola et al. 2020), gbOpen release.
"""
import json, math, sys

WANT = {
    "Akhaura": "akhaura", "Ashuganj": "ashuganj", "Banchharampur": "bancharampur",
    "Bijoynagar": "bijoynagar", "Brahmanbaria Sadar": "sadar", "Kasba": "kasba",
    "Nabinagar": "nabinagar", "Nasirnagar": "nasirnagar", "Sarail": "sarail",
}

def dp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1e-12
    idx, dmax = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n
        if d > dmax: idx, dmax = i, d
    if dmax > eps:
        return dp(pts[:idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def rings(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for p in polys:
        yield p[0]  # outer ring only

def main(src):
    data = json.load(open(src, encoding="utf8"))
    feats = {WANT[f["properties"]["shapeName"]]: f for f in data["features"] if f["properties"]["shapeName"] in WANT}
    assert len(feats) == 9, sorted(feats)
    allpts = [p for f in feats.values() for r in rings(f["geometry"]) for p in r]
    minx, maxx = min(p[0] for p in allpts), max(p[0] for p in allpts)
    miny, maxy = min(p[1] for p in allpts), max(p[1] for p in allpts)
    k = math.cos(math.radians((miny + maxy) / 2))
    S = 900 / ((maxx - minx) * k)
    W, H = 900, round((maxy - miny) * S)
    proj = lambda p: ((p[0] - minx) * k * S, (maxy - p[1]) * S)
    out = {}
    for key, f in feats.items():
        d, area, cx, cy = [], 0, 0, 0
        for r in rings(f["geometry"]):
            q = [proj(p) for p in r]; h = len(q) // 2
            pts = dp(q[:h + 1], 0.6)[:-1] + dp(q[h:], 0.6)
            if len(pts) < 4: continue
            d.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
            for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
                c = x1 * y2 - x2 * y1; area += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
        area /= 2
        out[key] = {"d": "".join(d), "cx": round(cx / (6 * area), 1), "cy": round(cy / (6 * area), 1)}
    json.dump({"width": W, "height": H, "proj": {"minx": minx, "maxy": maxy, "k": k, "s": S}, "source": "geoBoundaries gbOpen BGD ADM3, CC BY 4.0",
               "upazilas": out}, open("frontend/src/data/map.json", "w"), separators=(",", ":"))
    print("ok", W, H, {k: len(v["d"]) for k, v in out.items()})

main(sys.argv[1])
