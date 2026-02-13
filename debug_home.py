from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        page.goto("http://localhost:5000", timeout=30000)
        page.screenshot(path="debug_home.png")
        print("Screenshot saved.")
    except Exception as e:
        print(f"Error: {e}")
    browser.close()
