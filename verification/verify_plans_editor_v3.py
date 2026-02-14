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

    # Pre-set flags to avoid popups
    # Note: Javascript execution in evaluate
    page.evaluate(f"""
        localStorage.setItem('nst_current_user', '{json.dumps(admin_user)}');
        localStorage.setItem('nst_terms_accepted', 'true');
        localStorage.setItem('nst_has_seen_welcome', 'true');

        // Force tracker date to today
        const today = new Date().toDateString();
        localStorage.setItem('nst_last_daily_tracker_date', today);
        localStorage.setItem('nst_last_daily_challenge_date', today);
    """)

    page.reload()

    # Handle overlays dynamically
    for _ in range(5):
        try:
            if page.get_by_text("Daily Goal Tracker").is_visible():
                print("Dismissing Tracker...")
                page.get_by_text("Continue Learning").click()
                time.sleep(1)

            if page.get_by_text("Terms & Conditions").is_visible():
                print("Dismissing Terms...")
                page.get_by_text("I Agree & Continue").click()
                time.sleep(1)

            if page.locator("button:has(svg.lucide-x)").first.is_visible():
                 print("Clicking X...")
                 page.locator("button:has(svg.lucide-x)").first.click()
                 time.sleep(1)

        except:
            pass
        time.sleep(0.5)

    page.wait_for_selector("text=Admin Console", state="visible")
    print("Admin Dashboard loaded.")

    # Click Plans Manager
    page.get_by_text("Plans Manager").click(force=True)
    print("Clicked Plans Manager.")

    # Wait for the Editor
    try:
        page.wait_for_selector("text=Edit Subscription Plans", state="visible", timeout=5000)
    except:
        print("Failed to switch tab.")
        page.screenshot(path="verification/failed_tab_switch_v3.png")
        return

    # 2. Add New Plan
    page.click("text=Add New Plan")

    # 3. Find input
    input_loc = page.locator("input[placeholder='Plan Name'][value='New Plan']")

    # Wait for it
    input_loc.last.wait_for(state="visible")

    target_input = input_loc.last

    # 4. Edit
    target_input.fill("Verified Plan")

    # 5. Verify
    if target_input.input_value() == "Verified Plan":
        print("SUCCESS: Plan Name Input is working!")

    # 6. Delete
    row = target_input.locator("xpath=../..")
    del_btn = row.locator("button")

    page.on("dialog", lambda dialog: dialog.accept())
    del_btn.click()

    time.sleep(0.5)

    if page.locator("input[value='Verified Plan']").count() == 0:
        print("SUCCESS: Plan Deleted.")

    page.screenshot(path="verification/final_success.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
