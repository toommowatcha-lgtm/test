export const formatErrorMessage = (context: string, error: unknown): string => {
    // 1. Log the original error for developers
    console.error(context, error);

    // 2. Safely extract a message string
    let message: string;

    if (error && typeof error === 'object') {
        const err = error as Record<string, any>;

        // **Primary Strategy: Check for the most likely, specific error first.**
        // This addresses the recurring "Add Period" issue caused by a global unique constraint.
        // Supabase errors often have a `message` string with the raw Postgres error.
        if (typeof err.message === 'string' && err.message.includes('duplicate key value violates unique constraint "financial_period_unique_label_type"')) {
            return `${context}: A period with this name already exists for another stock. Your database has a global unique constraint on periods. To fix this, either use a unique period name for each stock, or update your database schema to remove the 'financial_period_unique_label_type' constraint.`;
        }

        // **Secondary Strategy: Generic parsing of Supabase/Postgrest error objects.**
        // We prioritize the most descriptive property that is a non-empty string.
        if (typeof err.details === 'string' && err.details.length > 0) {
            message = err.details;
        } else if (typeof err.message === 'string' && err.message.length > 0) {
            message = err.message;
        } else {
            // **Fallback Strategy: Serialize the object.**
            // This is the last resort for unknown object structures.
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
        // Handle other non-null types (numbers, booleans, etc.)
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
        return `${context}: Data inconsistency found. Expected a single record but found multiple or none. This might be due to duplicate data from a previous error.`;
    }

    // 4. Final check to prevent '[object Object]' from ever being returned.
    if (message.includes('[object Object]')) {
        return `${context}: An unexpected error object was received. Please check the console for details.`;
    }

    // 5. Return the final formatted message.
    return `${context}: ${message}`;
};
