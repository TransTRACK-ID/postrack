import jwt from 'jsonwebtoken';
import { storeUserMapping } from '../../utils/userMapping';
import { shouldUseSecureCookie } from '../../utils/cookieSecurity';

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { email, password } = body;
    const config = useRuntimeConfig();
    const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days

    if (email === config.adminEmail && password === config.adminPassword) {
        // Generate JWT - use email as sub for consistency
        const token = jwt.sign({ sub: email, email }, config.jwtSecret, { expiresIn: AUTH_SESSION_MAX_AGE_SECONDS });

        // Store user mapping for Super Admin lookups
        storeUserMapping(email, email);

        // Set secure cookie
        setCookie(event, 'auth_token', token, {
            httpOnly: true,
            secure: shouldUseSecureCookie(config.public.appUrl),
            sameSite: 'strict',
            maxAge: AUTH_SESSION_MAX_AGE_SECONDS
        });

        return { success: true };
    }

    throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
    });
});
