/**
 * Safely removes sensitive fields from an object or array of objects.
 * Standard PII fields to exclude: password, role, mobile, email (masking)
 */
export const excludeFields = <T extends object, K extends keyof T>(
  obj: T | T[],
  keys: K[]
): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => excludeFields(item, keys));
  }

  if (obj && typeof obj === 'object') {
    const newObj = { ...obj } as any;
    keys.forEach((key) => {
      delete newObj[key];
    });
    return newObj as Omit<T, K>;
  }

  return obj;
};

export interface SanitizableUser {
  id: string;
  password?: string;
  role?: string;
  mobile?: string;
  email?: string | null;
  [key: string]: any;
}

export const sanitizeUser = <T extends SanitizableUser>(user: T): Omit<T, 'password' | 'role'> => {
  return excludeFields(user, ['password', 'role']);
};

export const maskPrivateDetails = <T extends SanitizableUser>(user: T, sameUser: boolean = false): any => {
  if (!user) return user;
  const safe = sanitizeUser(user) as any;
  
  if (!sameUser) {
    safe.mobile = '';
    safe.email = '';
  }
  return safe;
};
