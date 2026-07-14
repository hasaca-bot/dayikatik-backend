# -*- coding: utf-8 -*-
import sqlite3
import shutil
import os
import sys

if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

chrome_path = os.path.expandvars('%LOCALAPPDATA%/Google/Chrome/User Data/Default/History')
edge_path = os.path.expandvars('%LOCALAPPDATA%/Microsoft/Edge/User Data/Default/History')

for name, path in [('Chrome', chrome_path), ('Edge', edge_path)]:
    if os.path.exists(path):
        conn = None
        try:
            shutil.copy2(path, 'temp_hist')
            conn = sqlite3.connect('temp_hist')
            cursor = conn.cursor()
            # Search specifically for onrender.com URLs
            cursor.execute("SELECT url, title, datetime(last_visit_time/1000000-11644473600,'unixepoch','localtime') FROM urls WHERE url LIKE '%onrender.com%' ORDER BY last_visit_time DESC LIMIT 150")
            rows = cursor.fetchall()
            print(f'=== {name} ===')
            for r in rows:
                print(f"{r[2]} | {r[0]} | {r[1]}")
        except Exception as e:
            print(f'Error reading {name}:', e)
        finally:
            if conn:
                conn.close()
            if os.path.exists('temp_hist'):
                try:
                    os.remove('temp_hist')
                except Exception as ex:
                    print(f"Could not remove temp_hist: {ex}")
