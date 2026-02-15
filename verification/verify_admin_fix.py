from playwright.sync_api import sync_playwright
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 1. Navigate to home
    page.goto("http://localhost:5000")

    # 2. Set Admin User and Flags in LocalStorage
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

    # 3. Reload to trigger auto-login and apply flags
    page.reload()

    # Wait for overlays to disappear (if any) or handle them
    try:
        # Check for Terms popup specifically just in case
        if page.is_visible("text=Terms & Conditions"):
            page.click("text=I Agree & Continue")
    except:
        pass

    # 4. Verify Admin Dashboard loaded
    page.wait_for_selector("text=Admin Console", state="visible")
    print("Admin Dashboard loaded.")

    # 5. Navigate to Pricing Tab
    # Use force=True to bypass overlapping elements if needed, but better to ensure overlay is gone.
    # We can try to wait a bit or check for overlay.
    page.get_by_text("💰 Pricing").click()

    # 6. Verify Store Feature Lists section
    page.wait_for_selector("text=Store Feature Lists (Basic vs Ultra)", state="visible")
    print("Pricing Page loaded successfully (List import fixed).")

    # 7. Navigate back to Dashboard
    # Try finding the back button using the arrow-left icon class structure or role
    # <button ...><ArrowLeft .../></button>
    # In Lucide, ArrowLeft usually renders an svg with class "lucide-arrow-left".
    page.locator("button:has(svg.lucide-arrow-left)").click()

    # 8. Navigate to Visibility Tab
    page.wait_for_selector("text=Admin Console", state="visible")
    page.get_by_text("Visibility").click()

    # 9. Verify Global Toggle
    page.wait_for_selector("text=Hide Topic Notes Globally", state="visible")
    print("Visibility Tab loaded. Toggle found.")

    # 10. Screenshot
    page.screenshot(path="verification/verification.png")
    print("Screenshot saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
