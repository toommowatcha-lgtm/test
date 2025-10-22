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
    - Paste the SQL into the editor and click `RUN`. This will create the `watchlist`, `stock_details`, `contacts`, and `financials` tables required for the app.

3.  **Set up Row Level Security (RLS) Policies:**
    - This is a critical step to allow the app to work without user logins.
    - In the `SQL Editor`, create another "New query".
    - Copy the entire content of `backend/supabase/migrations/0002_rls_policies.sql`.
    - Paste the SQL into the editor and click `RUN`. This creates policies that permit anonymous users to read and write data.

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

## 3. How It Works

- **Data Fetching:** The app uses the Supabase JS client to fetch data directly from your tables.
- **RLS Policies:** The app works without login because of the Row Level Security policies you set up in step 1.3. These policies explicitly grant the public anonymous key (`anon` role) permission to select, insert, update, and delete records.
- **Auto-Saving:** When you edit a field on the stock detail or financials page, a `debounce` function waits for you to stop typing for 1.5 seconds, then sends an `upsert` request to Supabase with the new data. An `upsert` operation will update the record if it exists or create it if it doesn't, making it very robust. A visual toast notification in the corner confirms the "Saving...", "Saved ✓", or "Error" status.
- **Routing:** `react-router-dom` handles the navigation between the main watchlist page (`/`), the individual stock detail pages (`/stock/:id`), and the financials page (`/stock/:id/financials`).