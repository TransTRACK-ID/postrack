import jwt from 'jsonwebtoken';

interface UserInfo {
  sub: string;
  email: string;
  name: string;
  username: string;
  givenName: string;
  familyName: string;
  picture: string;
  idToken: string;
  id?: string;
}

interface DecodedToken {
  email?: string;
  name?: string;
  sub?: string;
  authMethod?: string;
  realm?: string;
  providerId?: string;
  providerName?: string;
  exp?: number;
  iat?: number;
}

export default defineEventHandler((event) => {
    const token = getCookie(event, 'auth_token');
    const userInfoCookie = getCookie(event, 'user_info');
    const config = useRuntimeConfig();

    if (!token) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    let decoded: DecodedToken;
    try {
        decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
    } catch (e) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid or expired token'
        });
    }

    let userInfo: UserInfo | null = null;
    if (userInfoCookie) {
        try {
            userInfo = JSON.parse(Buffer.from(userInfoCookie, 'base64').toString('utf8'));
        } catch {
            userInfo = null;
        }
    }

    if (!userInfo && decoded) {
        userInfo = {
            sub: decoded.sub || '',
            email: decoded.email || '',
            name: decoded.name || '',
            username: decoded.email?.split('@')[0] || '',
            givenName: '',
            familyName: '',
            picture: '',
            idToken: ''
        };
    }

    const resolvedUserId = decoded.email || decoded.sub || 'unknown';

    const tokenExp = decoded.exp ? decoded.exp * 1000 : null;
    const isExpiringSoon = tokenExp && (tokenExp - Date.now()) < 5 * 60 * 1000;
    
    return {
        status: 'logged_in',
        storageDriver: config.nodeEnv === 'production' ? 'redis' : 'fs',
        user: userInfo ? { ...userInfo, id: resolvedUserId } : null,
        authMethod: decoded.authMethod || 'credentials',
        realm: decoded.realm || null,
        providerId: decoded.providerId || null,
        providerName: decoded.providerName || null,
        tokenExpiry: decoded.exp || null,
        isTokenExpiringSoon: isExpiringSoon || false
    };
});
