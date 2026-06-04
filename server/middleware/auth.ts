import jwt from 'jsonwebtoken';
import { getHeader } from 'h3';
import { isSuperAdmin } from '../utils/permissions';

export default defineEventHandler((event) => {
    const path = event.path;
    const config = useRuntimeConfig();

    const isApiRoute = path.startsWith('/api/admin') || 
                       path.startsWith('/api/shared-workspace') || 
                       (path.startsWith('/api/feedback') && !path.includes('/status'));
    const isProtectedPage = path.startsWith('/admin/sso');

    // Desktop auto-login: only if request comes from the Electron shell (verified by X-Desktop-Auth header)
    if (process.env.ELECTRON_DESKTOP && !getCookie(event, 'auth_token')) {
        const desktopAuthToken = process.env.DESKTOP_AUTH_TOKEN;
        const requestAuthToken = getHeader(event, 'X-Desktop-Auth');
        
        // Only auto-login if the request includes the correct desktop auth token
        if (desktopAuthToken && requestAuthToken === desktopAuthToken) {
            const desktopEmail = config.adminEmail || 'admin@local';
            const jwtSecret = process.env.JWT_SECRET || config.jwtSecret || 'desktop-local-secret';
            const desktopToken = jwt.sign({
                email: desktopEmail,
                sub: 'desktop-local-user',
                authMethod: 'desktop',
            }, jwtSecret, { expiresIn: '30d' });
            
            setCookie(event, 'auth_token', desktopToken, {
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });
            
            setCookie(event, 'user_info', Buffer.from(JSON.stringify({
                email: desktopEmail,
                name: 'Local Admin'
            })).toString('base64'), {
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30
            });
        }
    }

    // Protect admin, shared-workspace, and feedback submit API routes
    // Also protect specific admin pages that require server-side guards (e.g. /admin/sso)
    if (isApiRoute || isProtectedPage) {
        const token = getCookie(event, 'auth_token');

        if (!token) {
            if (isProtectedPage) return sendRedirect(event, '/login');
            throw createError({
                statusCode: 401,
                statusMessage: 'Unauthorized'
            });
        }

        const jwtSecret = process.env.ELECTRON_DESKTOP 
            ? (process.env.JWT_SECRET || config.jwtSecret) 
            : config.jwtSecret;
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret) as any;
        } catch (e) {
            if (isProtectedPage) return sendRedirect(event, '/login');
            throw createError({
                statusCode: 401,
                statusMessage: 'Invalid or expired token'
            });
        }

        event.context.user = {
            id: decoded.email || decoded.sub || decoded.id || 'unknown',
            email: decoded.email || 'unknown',
            workspaceId: decoded.workspaceId || 'personal',
            authMethod: decoded.authMethod || 'credentials',
            providerId: decoded.providerId || null
        };

        if (path.startsWith('/admin/sso') || path.startsWith('/api/admin/sso')) {
            if (!isSuperAdmin(event.context.user.email)) {
                if (isProtectedPage) return sendRedirect(event, '/');
                throw createError({
                    statusCode: 403,
                    statusMessage: 'Forbidden: Super Admin access required'
                });
            }
        }
    }
});
