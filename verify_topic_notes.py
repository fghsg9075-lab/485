import json
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()

    # Mock Admin User
    admin_user = {
        "id": "admin-1",
        "name": "Super Admin",
        "role": "ADMIN",
        "isPremium": True
    }

    url = "http://localhost:5000"
    page.goto(url)

    # Inject user into localStorage
    page.evaluate(f"localStorage.setItem('nst_current_user', '{json.dumps(admin_user)}')")

    # Reload to pick up user
    page.reload()
    page.wait_for_timeout(3000)

    # NUKE OVERLAYS STRATEGY
    print("Nuking overlays...")
    page.evaluate("""
        document.querySelectorAll('.fixed.inset-0').forEach(e => e.remove());
        document.body.style.overflow = 'auto';
    """)

    page.wait_for_timeout(1000)

    # Navigate to Admin Dashboard
    if page.get_by_text("Admin Console").is_visible():
        print("Already on Admin Console")
    elif page.get_by_text("Admin Panel").is_visible():
        print("Clicking Admin Panel...")
        page.get_by_text("Admin Panel").click()
        page.wait_for_timeout(2000)

    # Click "PDF Study Material" (CONTENT_PDF tab)
    print("Clicking PDF Study Material...")

    try:
        # Force click using dispatchEvent if standard click fails
        pdf_btn = page.locator("button").filter(has_text="PDF").first
        if pdf_btn.is_visible():
            pdf_btn.click(force=True)
        else:
            print("PDF Button not found via filter.")
            page.get_by_text("PDF / Notes").click(force=True)

    except Exception as e:
         print(f"Could not click PDF button: {e}")
         page.screenshot(path="failed_pdf_tab.png")
         return

    page.wait_for_timeout(2000)

    # Verify "Topic Notes Manager (New)" is visible
    print("Verifying Topic Notes Manager...")
    if page.get_by_text("Topic Notes Manager (New)").is_visible():
        print("Topic Notes Manager Found!")
        page.screenshot(path="verification_topic_notes.png")
    else:
        print("Topic Notes Manager NOT Found.")
        page.screenshot(path="failed_topic_notes_visible.png")
        return

    # Try to add a note
    print("Adding a Topic Note...")
    try:
        page.get_by_text("+ Add Topic Note").click()
        page.wait_for_timeout(500)
    except:
        print("Add Topic Note button not found.")
        return

    # Fill inputs
    try:
        page.get_by_placeholder("Topic (e.g. Introduction)").last.fill("Test Topic")
        page.get_by_placeholder("Note Title").last.fill("Test Note 1")
    except:
        pass

    page.screenshot(path="verification_topic_notes_added.png")
    print("Screenshot saved to verification_topic_notes_added.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
