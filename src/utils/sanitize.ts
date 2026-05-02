/**
 * Safely removes sensitive fields from an object or array of objects.
 * Standard PII fields to exclude: password, role, mobile, email (masking)
 */
export const excludeFields = <T extends object, K extends keyof T>(
  obj: T | T[],
  keys: K[]
): Omit<T, K> | Omit<T, K>[] => {
  if (Array.isArray(obj)) {
    return obj.map((item) => excludeFields(item, keys)) as Omit<T, K>[];
  }

  if (obj && typeof obj === 'object') {
    const newObj = { ...obj };
    keys.forEach((key) => {
      delete newObj[key];
    });
    return newObj as Omit<T, K>;
  }

  return obj as unknown as Omit<T, K>;
};

export interface SanitizableUser {
  id: string;
  password?: string;
  role?: string;
  mobile?: string;
  email?: string | null;
  accountStatus?: string;
  planType?: string;
  planExpiresAt?: Date | null;
  regId?: string;
  profile?: Record<string, unknown> | null;
  images?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export const sanitizeUser = <T extends SanitizableUser>(user: T): Omit<T, 'password' | 'role'> => {
  return excludeFields(user, ['password', 'role']) as Omit<T, 'password' | 'role'>;
};

export const maskPrivateDetails = <T extends SanitizableUser>(
  user: T, 
  sameUser: boolean = false
): Omit<T, 'password' | 'role'> & { mobile?: string; email?: string } => {
  if (!user) return user as unknown as Omit<T, 'password' | 'role'> & { mobile?: string; email?: string };
  const safe = sanitizeUser(user) as Record<string, unknown>;
  
  if (!sameUser) {
    safe.mobile = '';
    safe.email = '';
  }
  return safe as Omit<T, 'password' | 'role'> & { mobile?: string; email?: string };
};
