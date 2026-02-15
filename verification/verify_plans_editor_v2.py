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

    # Check what's on page
    page.wait_for_selector("text=Admin Console", state="visible")
    print("Admin Dashboard loaded.")

    # Screenshot dashboard
    page.screenshot(path="verification/dashboard_before_click.png")

    # Find Plans Manager button
    # It might be scrolled out of view?
    btn = page.get_by_text("Plans Manager")
    btn.scroll_into_view_if_needed()
    btn.click(force=True)

    print("Clicked Plans Manager.")

    # Wait for the Editor
    try:
        page.wait_for_selector("text=Edit Subscription Plans", state="visible", timeout=5000)
    except:
        print("Failed to switch tab. Dumping page text.")
        # print(page.content())
        page.screenshot(path="verification/failed_tab_switch.png")
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
    # The delete button is next to the input.
    # Structure: div.flex > div.flex-1 > input ... button

    # Get the parent div of the input's wrapper
    # Input is inside div.flex-1
    # Parent of div.flex-1 is div.flex (the row)
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
