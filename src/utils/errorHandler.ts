/**
 * Parses a raw error from Supabase or other sources into a user-friendly string.
 * It also logs the original error to the console for debugging.
 *
 * @param context - A string describing the operation that failed (e.g., "Error fetching watchlist").
 * @param error - The raw error object, which can be of any type.
 * @returns A formatted, user-friendly error message.
 */
export const formatErrorMessage = (context: string, error: unknown): string => {
    // 1. Log the original error for developers
    console.error(`[${context}] Raw Error:`, error);

    // 2. Safely extract a message string
    let message: string;

    if (error && typeof error === 'object') {
        const err = error as Record<string, any>;

        // **Primary Strategy: Check for specific, known error patterns first.**
        if (typeof err.message === 'string') {
            // Supabase error for unique constraint violation on `financial_period` (a common legacy name)
            if (err.message.includes('duplicate key value violates unique constraint "financial_period_unique_label_type"')) {
                return `${context}: A period with this name already exists for another stock due to a global unique constraint ("financial_period_unique_label_type"). Please use a different name or update your database schema to make the constraint per-stock.`;
            }
            // Supabase error for a more standard key name
             if (err.message.includes('duplicate key value violates unique constraint "financial_period_period_label_period_type_key"')) {
                return `${context}: A period with this name already exists for another stock. Your database has a global unique constraint on periods. Please use a unique period name or update your database schema.`;
            }
            // Supabase error for ON CONFLICT specification mismatch (42P10)
            if (err.code === '42P10') {
                 return `${context}: Database error (42P10). There is no unique constraint matching the ON CONFLICT specification. This is likely a developer error in the upsert logic.`;
            }
        }

        // **Secondary Strategy: Generic parsing of Supabase/Postgrest error objects.**
        if (typeof err.details === 'string' && err.details.length > 0) {
            message = err.details;
        } else if (typeof err.message === 'string' && err.message.length > 0) {
            message = err.message;
        } else {
            // **Fallback Strategy: Serialize the object.**
            try {
                const serialized = JSON.stringify(error);
                message = serialized === '{}' ? 'An empty error object was received.' : serialized;
            } catch {
                message = 'An un-serializable error object was received.';
            }
        }
    } else if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string' && error.length > 0) {
        message = error;
    } else if (error) {
        message = String(error);
    } else {
        message = 'An unknown error occurred.';
    }

    // 3. Convert common technical errors into more user-friendly advice.
    if (message.includes('violates row-level security policy')) {
        return `${context}: Access Denied. Please check your database's Row Level Security (RLS) policies.`;
    }
    if (message.toLowerCase().includes('failed to fetch')) {
        return `${context}: Network Error. Could not connect to the database. Please check your internet connection.`;
    }
    if (message.includes('does not exist')) {
        const match = message.match(/relation "public\.(.*?)" does not exist/);
        const tableName = match ? `'${match[1]}'` : 'a required table';
        return `${context}: Database table ${tableName} not found. Please ensure all schema migrations have been run.`;
    }
    if (message.includes('JWT')) {
        return `${context}: Authentication error. The Supabase Key may be invalid or expired.`;
    }
    if (message.includes('PGRST116') || message.includes('multiple (or no) rows returned')) {
        return `${context}: Data inconsistency found. Expected a single record but found multiple or none.`;
    }

    // 4. Final check to prevent '[object Object]'
    if (message.includes('[object Object]')) {
        return `${context}: An unexpected error object was received. Please check the console for details.`;
    }

    // 5. Return the final formatted message.
    return `${context}: ${message}`;
};
