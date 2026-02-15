from playwright.sync_api import sync_playwright
import time
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Mock User Data
    user_data = {
        "id": "test-user",
        "name": "Test Student",
        "role": "STUDENT",
        "mcqHistory": [
            {
                "id": "h1",
                "chapterId": "ch1",
                "chapterTitle": "Physics Chapter 1",
                "score": 40,
                "totalQuestions": 100,
                "date": "2023-01-01T00:00:00Z", # Old date, should be due
                "ultraAnalysisReport": json.dumps({
                    "topics": [
                        {"name": "Newton Laws", "status": "WEAK", "score": 40},
                        {"name": "Kinematics", "status": "STRONG", "score": 90}
                    ]
                })
            }
        ]
    }

    # Inject LocalStorage
    page.goto("http://localhost:5001")
    page.evaluate("(data) => { localStorage.setItem('nst_current_user', JSON.stringify(data)); localStorage.setItem('nst_terms_accepted', 'true'); }", user_data)

    # Reload to apply login
    page.reload()
    time.sleep(5) # Wait for load

    # Navigate to Revision Hub (Brain Icon in Tab Bar usually, but let's check tabs)
    # The tabs might be buttons. I'll click the one with "Revision" or icon.
    # In StudentDashboard, tabs are rendered. Revision Hub might be under "Notes" or separate.
    # User prompt: "Revision hub is accessed via the 'Notes' tab (Brain icon)"

    # Click 'Notes' tab (Brain icon)
    # Finding button with BrainCircuit icon or title
    try:
        # Check if we are stuck on Login
        if page.get_by_text("Unlock Smart Learning").is_visible():
            print("Stuck on Login Page. Retrying Auth Injection...")
            page.evaluate(f"localStorage.setItem('nst_current_user', '{json.dumps(user_data)}');")
            page.evaluate("localStorage.setItem('nst_terms_accepted', 'true');")
            page.reload()
            time.sleep(5)

        # Wait for Home to be visible to ensure dashboard loaded
        # Note: If dashboard fails, we might see nothing.
        # page.get_by_text("Home").first.wait_for()

        # NUCLEAR OPTION: Remove Overlays via JS (Targeting full screen overlays only)
        page.evaluate("""
            const overlays = document.querySelectorAll('div[class*="inset-0"][class*="z-[100]"]');
            overlays.forEach(el => el.remove());
            const modals = document.querySelectorAll('div[class*="inset-0"][class*="z-50"]');
            modals.forEach(el => el.remove());
        """)
        time.sleep(1)

        # Click the tab.
        page.get_by_role("button", name="Notes").click()
        time.sleep(2)

        # Verify Grouped Layout
        # Should see "Physics Chapter 1"
        if page.get_by_text("Physics Chapter 1").is_visible():
            print("Chapter Header Visible")

        # Should see "Newton Laws" with "WEAK" and "Due Today" (since date is old)
        if page.get_by_text("Newton Laws").is_visible():
            print("Subtopic Visible")

        # Click "Revise" on Newton Laws
        # Find the button near Newton Laws
        # We can use the text locator combined with button
        page.get_by_role("button", name="Revise").first.click()
        time.sleep(2)

        # Verify Modal Open
        if page.get_by_text("Study Notes").is_visible() and page.get_by_text("Quick Practice").is_visible():
            print("Revision Session Modal Opened")

        page.screenshot(path="verification/revision_hub.png")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
