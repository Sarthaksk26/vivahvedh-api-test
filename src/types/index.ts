import {
  Role,
  AccountStatus,
  PlanType,
  Gender,
  MaritalStatus,
} from '@prisma/client';

// ═══════════════════════════════════════════════════════════════════
//  JWT Token Payloads
// ═══════════════════════════════════════════════════════════════════

export interface AccessTokenPayload {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  planType: PlanType;
  requiresPasswordChange: boolean;
}

export interface RefreshTokenPayload {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════
//  Express AuthUser (used in req.user)
// ═══════════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  planType: PlanType;
  planExpiresAt: Date | null;
  requiresPasswordChange: boolean;
}

// ═══════════════════════════════════════════════════════════════════
//  API Response Payloads
// ═══════════════════════════════════════════════════════════════════

export interface LoginResponseUser {
  regId: string;
  role: Role;
  status: AccountStatus;
  planType: PlanType;
  requiresPasswordChange: boolean;
}

export interface LoginResponse {
  message: string;
  user: LoginResponseUser;
}

export interface ImageDTO {
  id: string;
  url: string;
  isPrimary: boolean;
  createdAt?: string;
}

export interface ProfileDTO {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender: Gender;
  maritalStatus: MaritalStatus;
  birthDateTime?: string | null;
  birthPlace?: string | null;
  aboutMe?: string | null;
  religionId?: number | null;
  casteId?: number | null;
  subCasteId?: number | null;
}

export interface PhysicalDTO {
  height?: string | null;
  weight?: number | null;
  bloodGroup?: string | null;
  complexion?: string | null;
  health?: string | null;
  disease?: string | null;
  diet?: string | null;
  smoke?: boolean | null;
  drink?: boolean | null;
}

export interface EducationDTO {
  qualificationId?: number | null;
  trade?: string | null;
  college?: string | null;
  jobBusiness?: string | null;
  jobAddress?: string | null;
  annualIncome?: string | null;
  specialAchievement?: string | null;
}

export interface FamilyDTO {
  fatherName?: string | null;
  fatherOccupation?: string | null;
  motherName?: string | null;
  motherOccupation?: string | null;
  motherHometown?: string | null;
  maternalUncleName?: string | null;
  brothers?: number;
  marriedBrothers?: number;
  sisters?: number;
  marriedSisters?: number;
  relativesSirnames?: string | null;
  familyBackground?: string | null;
  familyWealth?: string | null;
  agricultureLand?: string | null;
  plot?: string | null;
  flat?: string | null;
}

export interface AstrologyDTO {
  gothra?: string | null;
  rashi?: string | null;
  nakshatra?: string | null;
  charan?: string | null;
  nadi?: string | null;
  gan?: string | null;
  mangal?: string | null;
}

export interface PreferencesDTO {
  expectations?: string | null;
}

export interface AddressDTO {
  id?: string;
  addressType: string;
  addressLine?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  talukaId?: number | null;
  districtId?: number | null;
  stateId?: number | null;
}

export interface SearchResultUser {
  id: string;
  regId: string;
  planType: PlanType;
  accountStatus: AccountStatus;
  profile: ProfileDTO | null;
  images: ImageDTO[];
  education: EducationDTO | null;
  physical: PhysicalDTO | null;
}

export interface SearchPagination {
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface SearchResponse {
  results: SearchResultUser[];
  pagination: SearchPagination;
}

export interface FullUserProfile {
  id: string;
  regId: string;
  email?: string;
  mobile?: string;
  planType: PlanType;
  accountStatus: AccountStatus;
  planExpiresAt?: string | null;
  profileCreatedBy?: string | null;
  profile?: ProfileDTO | null;
  family?: FamilyDTO | null;
  physical?: PhysicalDTO | null;
  education?: EducationDTO | null;
  astrology?: AstrologyDTO | null;
  preferences?: PreferencesDTO | null;
  images?: ImageDTO[];
  addresses?: AddressDTO[];
}

export interface PublicProfileResponse extends FullUserProfile {
  mobile?: string;
  email?: string;
}
