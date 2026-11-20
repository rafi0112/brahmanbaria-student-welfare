"""Builds wordpress/bswa-site.zip: the BSWA website as a WordPress plugin.

    python wordpress/build.py                      (from the project folder)

It builds the frontend against the live API (the same build as the Cloudflare site), puts it in the plugin's app/
folder next to bswa-site.php and readme.txt, adds gzip copies of scripts and styles, and zips the bswa-site folder
with forward-slash paths (what WordPress expects). The Supabase address and public key come from frontend/.env,
as for any build. The zip itself is not kept in Git.
"""
import gzip
import os
import shutil
import subprocess
import sys
import zipfile

API = os.environ.get('BSWA_API', 'https://brahmanbaria-student-welfare.onrender.com')
HERE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(HERE, '..', 'frontend')
STAGE = os.path.join(HERE, 'build')
PLUGIN = os.path.join(STAGE, 'bswa-site')
OUT = os.path.join(HERE, 'bswa-site.zip')

shutil.rmtree(STAGE, ignore_errors=True)
os.makedirs(PLUGIN)
for f in ('bswa-site.php', 'readme.txt'):
    shutil.copy(os.path.join(HERE, 'bswa-site', f), PLUGIN)

env = dict(os.environ, VITE_API_BASE=API)
npx = 'npx.cmd' if os.name == 'nt' else 'npx'
subprocess.run([npx, 'vite', 'build', '--outDir', os.path.join(PLUGIN, 'app'), '--emptyOutDir'], cwd=FRONT, env=env, check=True)
headers = os.path.join(PLUGIN, 'app', '_headers')  # Cloudflare-only; the plugin sends its own headers
if os.path.exists(headers):
    os.remove(headers)

for root, _, files in os.walk(os.path.join(PLUGIN, 'app')):
    for f in files:
        if f.endswith(('.js', '.css', '.svg', '.json', '.webmanifest', '.xml', '.txt')):
            p = os.path.join(root, f)
            raw = open(p, 'rb').read()
            if len(raw) > 1024:
                open(p + '.gz', 'wb').write(gzip.compress(raw, 9, mtime=0))

def make(out, skip=()):
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(PLUGIN):
            dirs.sort()
            for f in sorted(files):
                p = os.path.join(root, f)
                name = os.path.relpath(p, STAGE).replace(os.sep, '/')
                if not name.startswith(skip):
                    z.write(p, name)
    print('made', out, round(os.path.getsize(out) / 1e6, 1), 'MB', file=sys.stderr)


# bswa-site.zip: everything. bswa-site-lite.zip: without the built-in pictures (the plugin takes those from the main
# site), small enough for any WordPress upload limit.
make(OUT)
make(os.path.join(HERE, 'bswa-site-lite.zip'), skip=('bswa-site/app/images/',))
shutil.rmtree(STAGE, ignore_errors=True)
