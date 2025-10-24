export const formatErrorMessage = (context: string, error: unknown): string => {
    // 1. Log the original error for developers to see the raw error object
    console.error(context, error);

    // 2. Safely extract a message string
    let message: string;

    if (error instanceof Error) {
        message = error.message;
    } else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
        message = (error as any).message;
    } else if (error && typeof error === 'object' && 'details' in error && typeof (error as any).details === 'string') {
        message = (error as any).details;
    } else if (typeof error === 'string' && error) {
        message = error;
    } else {
        try {
            message = JSON.stringify(error);
        } catch {
            message = 'An unexpected error occurred. Check the console for details.';
        }
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