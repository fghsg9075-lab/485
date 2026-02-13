from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_lesson_view(page: Page):
    # Navigate to app
    page.goto("http://localhost:5173")
    
    # Wait for content to load
    page.wait_for_selector("text=Test Lesson")
    
    # Verify "AI writing..." indicator (Streaming)
    expect(page.locator("text=AI writing...")).to_be_visible()
    
    # Verify Translate Button
    expect(page.locator("text=Hindi (हिंदी)")).to_be_visible()
    
    # Take screenshot
    page.screenshot(path="/home/jules/verification/lesson_view.png")
    print("Screenshot taken")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_lesson_view(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
