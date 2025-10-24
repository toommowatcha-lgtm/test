export const formatErrorMessage = (context: string, error: unknown): string => {
    // 1. Log the original error for developers
    console.error(context, error);

    // 2. Safely extract a message string, starting with a default
    let message = 'An unexpected error occurred. Check the console for details.';

    if (error instanceof Error) {
        message = error.message;
    } else if (error && typeof error === 'object') {
        const err = error as { message?: string; details?: string };
        if (typeof err.message === 'string' && err.message) {
            message = err.message;
        } else if (typeof err.details === 'string' && err.details) {
            message = err.details;
        }
    } else if (typeof error === 'string' && error) {
        message = error;
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

    // 4. Return the formatted message.
    return `${context}: ${message}`;
};