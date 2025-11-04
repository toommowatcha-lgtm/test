# Personal Stock Research App

A simple, clean, and fast web application for conducting and saving personal stock research. This app connects directly to a Supabase backend for real-time data persistence, without the need for user authentication.

## Features

- **No Login Required:** A single-user experience. Just open the app and start your research.
- **Watchlist Homepage:** View all your tracked stocks at a glance.
- **Add Stocks Easily:** A simple modal allows you to quickly add new stocks to your watchlist.
- **In-Depth, Editable Analysis:** A dedicated page for each stock with structured sections for business overview, revenue breakdown, competitive moat, and more.
- **Editable Financials Page:** A dynamic table for quarterly and annual financial metrics (Revenue, EPS, etc.) with an interactive chart.
- **Auto-Save to Supabase:** All your research notes and data are automatically saved to your Supabase database in real-time as you type.
- **Dynamic Components:** Add and remove revenue segments or financial metrics on the fly.
- **Clean UI:** A minimalist, responsive interface inspired by tools like Notion and Airtable.

## Tech Stack

- **Frontend:** React 18 (Vite), TypeScript, Tailwind CSS, Recharts, React Router, Lodash
- **Backend:** Supabase (Postgres)
- **Deployment:** Vercel, Netlify, or any static site host.

---

## 1. Supabase Setup

### Steps

1.  **Create a Supabase Project:**
    - Go to [supabase.com](https://supabase.com) and create a new project.
    - This application's code is pre-configured to connect to a specific Supabase instance. To use your own, update the credentials in `src/services/supabaseClient.ts`.

2.  **Set up Database Schema:**
    - In your Supabase project dashboard, navigate to the `SQL Editor`.
    - Create a "New query".
    - Copy the entire content of `backend/supabase/migrations/0001_initial_schema.sql` from this project.
    - Paste the SQL into the editor and click `RUN`. This will create the `watchlist`, `business_overview`, `contacts`, and `financials` tables required for the app.

3.  **Set up Row Level Security (RLS) Policies:**
    - This is a critical step to allow the app to work without user logins.
    - In the `SQL Editor`, create another "New query".
    - Copy the entire content of `backend/supabase/migrations/0002_rls_policies.sql`.
    - Paste the SQL into the editor and click `RUN`. This creates policies that permit anonymous users to read and write data.

4.  **Set up Automatic Financials Trigger:**
    - This step creates a database trigger that automatically populates default financial data when you add a new stock to your watchlist.
    - In the `SQL Editor`, create another "New query".
    - Copy the entire content of `backend/supabase/migrations/0003_default_financials_trigger.sql`.
    - Paste the SQL into the editor and click `RUN`.

---

## 2. Local Development

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Steps

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd stock-research-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`. Any changes you make in the code will be reflected live in the browser.

---

### Service Layer, Seeding, and Testing

This project includes a robust service layer for interacting with the Supabase database, along with scripts for seeding test data and running unit tests.

#### Seeding the Database

A seed script is provided to populate your database with initial data for a test stock (`TEST`). This is useful for development and manual testing.

**To run the seed script:**

1.  Navigate to your Supabase project dashboard.
2.  Go to the **SQL Editor**.
3.  Click **"New query"**.
4.  Copy the entire content of `scripts/seed_financial_test_data.sql`.
5.  Paste the SQL into the editor and click **`RUN`**. The script is idempotent and can be run multiple times.

#### Running Tests

Unit tests for the service layer are written using Jest. They mock the Supabase client and do not require a running database. Ensure you have Jest installed as a dev dependency (`npm install --save-dev jest @types/jest ts-jest`).

**To run the tests:**

```bash
# Make sure your package.json has a "test" script: "test": "jest"
npm test
```

---

## 3. Troubleshooting

### Error: "Failed to add and link financial period: A period with this name already exists for another stock."

If you encounter this specific error when trying to add a financial period (e.g., "Q1 2025") to a second stock after it already exists for another, it is because your database schema is enforcing a *global* unique constraint on period names.

The application is designed to allow per-stock periods, but the initial schema had an overly restrictive rule.

**How to Fix:**

You need to run a single SQL command in your Supabase project to remove this constraint. This is a one-time fix.

1.  Navigate to your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2.  Go to the **SQL Editor** in the left sidebar.
3.  Click **"New query"**.
4.  Copy and paste the following command into the editor:

    ```sql
    ALTER TABLE public.financial_period DROP CONSTRAINT financial_period_unique_label_type;
    ```

5.  Click **`RUN`**.

After running this command, the error will be resolved, and you can add the same period to multiple stocks as intended. The application will still prevent you from adding the same period to the *same stock* twice, which is the correct behavior.

---

## 4. How It Works

- **Data Fetching:** The app uses the Supabase JS client to fetch data directly from your tables.
- **RLS Policies:** The app works without login because of the Row Level Security policies you set up in step 1.3. These policies explicitly grant the public anonymous key (`anon` role) permission to select, insert, update, and delete records.
- **Auto-Saving:** When you edit a field on the stock detail or financials page, a `debounce` function waits for you to stop typing for 1.5 seconds, then sends an `upsert` request to Supabase with the new data. An `upsert` operation will update the record if it exists or create it if it doesn't, making it very robust. A visual toast notification in the corner confirms the "Saving...", "Saved ✓", or "Error" status.
- **Routing:** `react-router-dom` handles the navigation between the main watchlist page (`/`), the individual stock detail pages (`/stock/:id`), and the financials page (`/stock/:id/financials`).