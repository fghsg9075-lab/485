from playwright.sync_api import Page, expect, sync_playwright
import time
import json
import os
import datetime

def verify_student_store(page: Page):
    print("Verifying Student Store UI...")

    # 1. Setup Student User
    student = {
        "id": "test-student-1",
        "name": "Test Student",
        "role": "STUDENT",
        "credits": 1000,
        "isPremium": True,
        "subscriptionTier": "MONTHLY",
        "subscriptionLevel": "ULTRA",
        "subscriptionEndDate": "2025-12-31T00:00:00.000Z",
        "board": "CBSE",
        "classLevel": "10",
        "stream": None
    }

    page.goto("http://localhost:5001")

    # Inject localStorage with ALL suppression flags
    today = datetime.date.today().strftime("%a %b %d %Y")

    page.evaluate(f"""(data) => {{
        window.localStorage.setItem('nst_current_user', JSON.stringify(data));
        window.localStorage.setItem('nst_terms_accepted', 'true');
        window.localStorage.setItem('nst_has_seen_welcome', 'true');
        window.localStorage.setItem('nst_last_daily_tracker_date', '{today}');
        window.localStorage.setItem('nst_last_daily_challenge_date', '{today}');
    }}""", student)

    page.reload()

    # Wait for Dashboard
    try:
        page.wait_for_selector("text=Test Student", timeout=10000)
    except Exception as e:
        print(f"Wait failed: {e}")
        page.screenshot(path="verification/error_wait_student.png")
        return

    # Navigate to Store via Header "Credits" button
    try:
        print("Clicking Credits (Store link)...")
        # Locator for Credits text
        page.click("text=Credits")
    except Exception as e:
        print(f"Failed to navigate to Store via Credits: {e}")
        # Fallback: Try Sidebar
        try:
            print("Fallback: Clicking Sidebar Menu...")
            page.click("button.bg-white.border.border-slate-200.shadow-sm") # The hamburger menu button
            time.sleep(1)
            # Store link might not be direct in sidebar based on code reading, but let's check
            # Sidebar has 'My Plan' (SUB_HISTORY), 'Redeem'.
            # AI Studio has 'Get Premium Access'.
            # Let's try AI Studio tab
            print("Fallback 2: Clicking AI Studio...")
            page.click("text=AI Studio")
            time.sleep(1)
            # Find Banner or Button linking to Store
            page.click("text=Get Premium Access")
        except Exception as e2:
            print(f"Fallback failed: {e2}")
            page.screenshot(path="verification/error_nav_store.png")
            return

    time.sleep(3) # Wait for animation/render

    page.screenshot(path="verification/store_student.png")
    print("Screenshot taken: verification/store_student.png")

def verify_admin_dashboard(page: Page):
    print("Verifying Admin Dashboard Cleanup...")

    # 1. Setup Admin User
    admin = {
        "id": "test-admin-1",
        "name": "Test Admin",
        "role": "ADMIN",
        "credits": 99999,
        "isPremium": True
    }

    page.goto("http://localhost:5001")

    # Inject localStorage
    page.evaluate("window.localStorage.clear();")
    page.evaluate("(data) => window.localStorage.setItem('nst_current_user', JSON.stringify(data))", admin)

    page.reload()

    # Wait for Dashboard (Updated text)
    try:
        page.wait_for_selector("text=Admin Console", timeout=10000)
    except:
        print("Admin Console not found")
        page.screenshot(path="verification/error_admin_wait.png")
        return

    # Verify Cleanup
    try:
        content = page.content()
        if "EXPLORE BANNERS" in content:
            print("FAILURE: EXPLORE BANNERS still visible in DOM")
        else:
            print("SUCCESS: EXPLORE BANNERS not found")

        if "FEATURE CONTROL" in content:
            print("FAILURE: FEATURE CONTROL still visible in DOM")
        else:
            print("SUCCESS: FEATURE CONTROL not found")

    except Exception as e:
        print(f"Cleanup Verification Failed: {e}")

    page.screenshot(path="verification/admin_dashboard.png")
    print("Screenshot taken: verification/admin_dashboard.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        try:
            if not os.path.exists("verification"):
                os.makedirs("verification")

            # Admin first
            verify_admin_dashboard(page)

            # Student
            verify_student_store(page)

        except Exception as e:
            print(f"Global Error: {e}")
            page.screenshot(path="verification/error_global.png")
        finally:
            browser.close()
