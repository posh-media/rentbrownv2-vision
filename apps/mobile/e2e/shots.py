#!/usr/bin/env python3
"""Drive the Expo Go app via adb deep links + taps; capture screenshots."""
import re, subprocess, sys, time, os

DEV = "emulator-5554"
BASE = "exp://localhost:8081/--/"
OUT = r"C:\dev\_rentbrown_reference\screens\mobile"
ENV = dict(os.environ, MSYS_NO_PATHCONV="1")

def sh(*args):
    return subprocess.run(args, capture_output=True, text=True, env=ENV).stdout

def tap(x, y):
    sh("adb", "-s", DEV, "shell", "input", "tap", str(x), str(y))

def ui_xml():
    sh("adb", "-s", DEV, "shell", "uiautomator", "dump")
    time.sleep(0.4)
    return sh("adb", "-s", DEV, "shell", "cat", "/sdcard/window_dump.xml")

def find_bounds(label, xml):
    # match text= or content-desc=
    for attr in ("text", "content-desc"):
        pat = re.compile(r'%s="%s"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"' % (attr, re.escape(label)))
        m = pat.search(xml)
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            return ((x1 + x2) // 2, (y1 + y2) // 2)
    return None

def tap_label(label, tries=3, wait=0.8):
    for _ in range(tries):
        xml = ui_xml()
        b = find_bounds(label, xml)
        if b:
            tap(*b)
            time.sleep(wait)
            return True
        time.sleep(0.8)
    print("  !! not found:", label)
    return False

def deeplink(path, wait=4):
    sh("adb", "-s", DEV, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", BASE + path.lstrip("/"))
    time.sleep(wait)

def shot(name, wait=2):
    time.sleep(wait)
    out = os.path.join(OUT, name + ".png")
    subprocess.run(f'adb -s {DEV} exec-out screencap -p > "{out}"', shell=True, env=ENV)
    print("  shot:", name)

def texts():
    xml = ui_xml()
    return sorted(set(re.findall(r'text="([^"]{2,})"', xml)))

os.makedirs(OUT, exist_ok=True)
step = sys.argv[1] if len(sys.argv) > 1 else "all"

if step in ("all", "shots"):
    # Welcome / auth
    deeplink("/welcome"); shot("welcome", 3)
    deeplink("/login"); shot("login", 2)
    # Log in via deeplink? session persists from default scenario -> gate sends home.
    deeplink("/home", 5); shot("home", 3)
    deeplink("/explore", 4); shot("explore", 2)
    deeplink("/explore/the-terraces-ikoyi", 4); shot("opportunity-details", 3)
    deeplink("/portfolio", 4); shot("portfolio", 2)
    deeplink("/portfolio/inv_terraces_2", 4); shot("investment-detail", 2)
    deeplink("/wallet", 4); shot("wallet", 2)
    deeplink("/wallet/transactions", 4); shot("transactions", 2)
    deeplink("/wallet/withdrawals/wd_03", 4); shot("withdrawal-status", 2)
    deeplink("/notifications", 4); shot("notifications", 2)
    deeplink("/referrals", 4); shot("referrals", 2)
    deeplink("/account", 4); shot("account", 2)
    deeplink("/security", 4); shot("security", 2)

if step in ("all", "checkout"):
    # Real checkout flow: open checkout, pick wallet, accept terms, confirm, PIN
    deeplink("/checkout/rnd_terraces_2", 5); shot("checkout", 2)
    tap_label("Wallet")
    tap_label("Accept terms")
    tap_label("Confirm")
    time.sleep(1); shot("pin-sheet", 1)
    for d in "123456":
        tap_label(d, tries=2, wait=0.3)
    time.sleep(6); shot("payment-result", 2)

if step in ("all", "deposit"):
    deeplink("/deposit", 4); shot("deposit", 2)
    tap_label("₦50,000")
    tap_label("Continue")
    time.sleep(1)
    tap_label("Continue")  # method step -> submit (bank transfer default? need tap)
    time.sleep(4); shot("deposit-status", 2)

if step in ("all", "withdraw"):
    deeplink("/withdraw", 4)
    tap_label("Max")
    time.sleep(1.5)
    shot("withdraw", 1)

print("done")
