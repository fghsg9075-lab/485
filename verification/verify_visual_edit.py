from playwright.sync_api import sync_playwright
import json
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:5000")

    # Set Admin
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
        const today = new Date().toDateString();
        localStorage.setItem('nst_last_daily_tracker_date', today);
        localStorage.setItem('nst_last_daily_challenge_date', today);
    """)

    page.reload()

    # Handle overlays
    for _ in range(3):
        try:
            if page.locator("button:has(svg.lucide-x)").first.is_visible():
                 page.locator("button:has(svg.lucide-x)").first.click()
                 time.sleep(0.5)
        except:
            pass

    page.wait_for_selector("text=Admin Console", state="visible")

    page.get_by_text("Plans Manager").click(force=True)

    page.wait_for_selector("text=Edit Subscription Plans", state="visible")

    # Add New Plan
    page.click("text=Add New Plan")

    # Find input
    new_plan_inputs = page.locator("input[placeholder='Plan Name'][value='New Plan']")
    new_plan_inputs.last.wait_for(state="visible")
    target_input = new_plan_inputs.last

    target_input.fill("Visual Verification Plan")

    # Scroll to it
    target_input.scroll_into_view_if_needed()

    page.screenshot(path="verification/visual_edit.png")
    print("Screenshot saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
