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
    """)

    page.reload()

    # Aggressively handle overlays
    try:
        # Wait a bit for animations
        page.wait_for_timeout(2000)

        # Click "I Agree" if present
        if page.get_by_text("I Agree & Continue").is_visible():
            page.get_by_text("I Agree & Continue").click(force=True)
            print("Dismissed Terms.")

        # Click "Close" buttons if any other popups (Welcome, etc)
        # Check for generic close buttons
        close_btns = page.locator("button:has(svg.lucide-x)")
        if close_btns.count() > 0:
            for i in range(close_btns.count()):
                if close_btns.nth(i).is_visible():
                    close_btns.nth(i).click(force=True)
                    print("Dismissed a popup.")

    except Exception as e:
        print(f"Overlay handling warning: {e}")

    page.wait_for_selector("text=Admin Console", state="visible")

    # 1. Navigate to Plans Manager
    # Use force=True to bypass potential invisible overlays
    page.get_by_text("Plans Manager").click(force=True)

    page.wait_for_selector("text=Edit Subscription Plans", state="visible")

    # 2. Add New Plan
    page.click("text=Add New Plan")
    time.sleep(0.5)

    # 3. Find the newly added plan input
    new_plan_inputs = page.locator("input[placeholder='Plan Name'][value='New Plan']")

    count = new_plan_inputs.count()
    if count == 0:
        # Fallback: check if we can find just by placeholder and take last
        new_plan_inputs = page.locator("input[placeholder='Plan Name']")
        count = new_plan_inputs.count()

    if count == 0:
        print("ERROR: New Plan input not found!")
        page.screenshot(path="verification/error_no_plan.png")
        browser.close()
        return

    target_input = new_plan_inputs.nth(count - 1)

    # 4. Edit the plan name
    target_input.fill("Playwright Test Plan")

    # 5. Verify the update
    updated_value = target_input.input_value()
    if updated_value == "Playwright Test Plan":
        print("SUCCESS: Plan name edited successfully.")
    else:
        print(f"ERROR: Plan name mismatch. Expected 'Playwright Test Plan', got '{updated_value}'")

    # 6. Delete the plan
    plan_container = target_input.locator("xpath=../..")
    # The delete button is the button in this container (it's the only button in that flex row)
    delete_btn = plan_container.locator("button")

    # Handle Confirm Dialog
    page.on("dialog", lambda dialog: dialog.accept())

    delete_btn.click()

    time.sleep(0.5)

    # 7. Verify deletion
    if page.locator("input[value='Playwright Test Plan']").count() == 0:
        print("SUCCESS: Plan deleted successfully.")
    else:
        print("ERROR: Plan was not deleted.")

    page.screenshot(path="verification/plans_editor_verified.png")
    print("Screenshot saved.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
