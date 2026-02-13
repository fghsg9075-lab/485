# Student App

## AI Setup

### Gemini AI
To enable Gemini AI features, you need to provide Google Gemini API Keys.

**Method 1: Admin Dashboard (Recommended for Rotation)**
1. Log in as Admin.
2. Go to **Config** -> **Security**.
3. Under "Gemini API Keys", paste your keys one by one.
4. Get keys from [Google AI Studio](https://aistudio.google.com/app/apikey).

**Method 2: Environment Variables (Server-side Fallback)**
Set the following environment variable in Vercel:
`GEMINI_API_KEYS="key1,key2,key3"`
(Comma-separated list of keys).

### Groq AI
Similar to Gemini, set keys in the Admin Dashboard or use `GROQ_API_KEYS` in Vercel.

---

## 🚀 Features & Workflows

### 1. MCQ & Topic Analysis (Non-AI Smart Analysis)
The app intelligently analyzes student performance **without relying on external AI API calls** for every test. This is achieved through granular data tracking.

*   **Data Entry (Admin):**
    *   When importing MCQs (via Google Sheets/Excel in `AdminDashboard`), the system looks for a **"Topic"** field.
    *   Format: You can add a column for Topic, or write `Topic: Ohm's Law` in the explanation field. The system automatically parses and tags the question.
*   **Performance Tracking (Student):**
    *   When a student submits a test in `McqView`, the app calculates their score.
    *   It also iterates through every question answered. If the question has a "Topic" tag, the app updates the student's global `topicStrength` profile (e.g., `Ohm's Law: 15/20 correct`).
    *   This builds a persistent "Weak vs Strong" map for the student over time.

### 2. Smart Recommendation System
This feature suggests specific study materials (Notes/PDFs) to students based on their "Weak Topics".

#### **🅰️ Admin Workflow (Adding Recommendations)**
1.  Go to **Admin Dashboard** -> **Universal Recommended Notes**.
2.  **Select Context:** Choose the Board, Class, Subject, and Chapter (Lesson).
3.  **Manage Notes:** Click the **"Manage Notes"** button for that chapter.
4.  **Add Note:**
    *   **Topic Name:** Enter the specific topic this note covers (e.g., "Ohm's Law Derivation"). *Crucial: This name is used to match against the student's weak areas.*
    *   **PDF URL:** Paste the Google Drive or direct PDF link.
    *   **Cost:** Set a price in coins (or 0 for Free).
    *   **Access:** Choose if it's Free, Basic, or Ultra.
5.  Click **"Save All Changes"**.

#### **🅱️ Student Workflow (Viewing Recommendations)**
1.  **Trigger:** Student finishes a test or opens a Marksheet.
2.  **Detection:** The app checks the score for each topic in that test.
    *   If score < 60%, the topic is flagged as **"WEAK"**.
3.  **Matching:** The app searches the Admin's "Universal Notes" list for notes where the `Topic Name` matches the student's weak topic.
4.  **Display:**
    *   A **"Recommend"** button appears on the Marksheet.
    *   Clicking it shows a list of:
        *   **Premium Recommendations:** The specific PDFs added by the Admin for those topics.
        *   **Free Recommendations:** A direct link to the Chapter's Free Notes section (fallback).
5.  **Access:** Clicking "View" opens the PDF instantly (using `directResource` mode) without needing to navigate through menus.

### 3. Statistical Analysis
To provide insights without AI costs:
*   **Marksheet:** Shows Accuracy %, Speed (Avg Time/Question), and a "Mistakes Review" section.
*   **Admin User History:** Shows a "Performance Summary" block calculating Total Tests taken, Average Score, and Overall Accuracy directly from the user's database records.
