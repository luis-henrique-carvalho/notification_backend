import { UserRole } from '../enums/user-role.enum';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
