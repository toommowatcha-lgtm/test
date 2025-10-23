
export const formatErrorMessage = (context: string, error: unknown): string => {
    console.error(context, error); // Log the original error for debugging

    let message: string;

    if (error instanceof Error) {
        message = error.message;
    } else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
        // This handles Supabase PostgrestError
        message = (error as { message: string }).message;
    } else if (typeof error === 'string') {
        message = error;
    } else {
        // Fallback for other types, including plain objects
        try {
            message = JSON.stringify(error);
        } catch {
            message = 'An unexpected error occurred. Could not stringify the error object.';
        }
    }

    // User-friendly messages for common issues
    if (message.includes('violates row-level security policy')) {
        return `${context}: Access Denied. Please check your database's Row Level Security (RLS) policies to ensure permissions are correctly configured.`;
    }
    if (message.toLowerCase().includes('failed to fetch')) {
        return `${context}: Network Error. Could not connect to the database. Please check your internet connection and Supabase URL.`;
    }
    if (message.includes('relation "public.') && message.includes('does not exist')) {
        const match = message.match(/relation "public\.(.*?)" does not exist/);
        const tableName = match ? match[1] : 'a required';
        return `${context}: Database table '${tableName}' not found. Please ensure you have run all initial schema migrations in your Supabase project.`;
    }
    if (message.includes('JWT')) {
        return `${context}: Authentication error. The provided Supabase Anon Key appears to be invalid or expired.`;
    }

    // Avoid showing a raw '{}'
    if (message === '{}') {
        message = 'An unexpected error occurred with no details.';
    }

    return `${context}: ${message}`;
};
