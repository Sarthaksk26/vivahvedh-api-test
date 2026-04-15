/**
 * Safely removes sensitive fields from an object or array of objects.
 * Standard PII fields to exclude: password, role, mobile, email (masking)
 */
export const excludeFields = <T, K extends keyof T>(
  obj: T | T[],
  keys: K[]
): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => excludeFields(item, keys));
  }

  if (obj && typeof obj === 'object') {
    const newObj = { ...obj };
    keys.forEach((key) => {
      delete (newObj as any)[key];
    });
    return newObj;
  }

  return obj;
};

export const sanitizeUser = (user: any) => {
  return excludeFields(user, ['password', 'role'] as any);
};

export const maskPrivateDetails = (user: any, sameUser: boolean = false) => {
  if (!user) return user;
  const safe = sanitizeUser(user);
  
  if (!sameUser) {
    safe.mobile = '';
    safe.email = '';
  }
  return safe;
};
