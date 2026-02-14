from playwright.sync_api import sync_playwright
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:5000")

    admin_user = {
        "id": "admin-123",
        "name": "Test Admin",
        "role": "ADMIN",
        "isPremium": True,
        "credits": 9999
    }

    page.evaluate(f"""
        localStorage.setItem('nst_current_user', '{json.dumps(admin_user)}');
        localStorage.setItem('nst_terms_accepted', 'true');
        localStorage.setItem('nst_has_seen_welcome', 'true');
        localStorage.setItem('nst_last_daily_tracker_date', new Date().toDateString());
        localStorage.setItem('nst_last_daily_challenge_date', new Date().toDateString());
    """)

    page.reload()

    try:
        if page.is_visible("text=Terms & Conditions"):
            page.click("text=I Agree & Continue")
    except:
        pass

    page.wait_for_selector("text=Admin Console", state="visible")

    # Go to Visibility
    page.get_by_text("Visibility").click()

    # Locate the toggle
    toggle_text = page.locator("text=Hide Topic Notes Globally")
    toggle_text.wait_for(state="visible")

    # Scroll to it
    toggle_text.scroll_into_view_if_needed()

    # Screenshot
    page.screenshot(path="verification/verification_scrolled.png")
    print("Scrolled screenshot saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
