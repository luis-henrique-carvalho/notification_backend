import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO for user registration via user.register message pattern.
 */
export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;
}

/**
 * DTO for user login via user.login message pattern.
 */
export class LoginDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

/**
 * Response DTO returned after successful login.
 */
export class LoginResponseDto {
    accessToken: string;
    user: UserResponseDto;
}

/**
 * Response DTO representing a user (without password).
 */
export class UserResponseDto {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}
