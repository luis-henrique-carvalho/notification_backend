import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO for user registration via user.register message pattern.
 */
export class RegisterDto {
    @ApiProperty({ description: 'The name of the user', example: 'John Doe' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'The email address of the user', example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'The password of the user, min length 6', example: 'strongpassx123' })
    @IsString()
    @MinLength(6)
    password: string;
}

/**
 * DTO for user login via user.login message pattern.
 */
export class LoginDto {
    @ApiProperty({ description: 'The email address of the user', example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'The password of the user' })
    @IsString()
    @IsNotEmpty()
    password: string;
}

/**
 * Response DTO representing a user (without password).
 */
export class UserResponseDto {
    @ApiProperty({ description: 'The unique identifier of the user' })
    id: string;

    @ApiProperty({ description: 'The name of the user' })
    name: string;

    @ApiProperty({ description: 'The email address of the user' })
    email: string;

    @ApiProperty({ description: 'The role of the user (e.g. user, admin)' })
    role: string;

    @ApiProperty({ description: 'The date and time the user was created' })
    createdAt: Date;

    @ApiProperty({ description: 'The date and time the user was last updated' })
    updatedAt: Date;
}

/**
 * Response DTO returned after successful login.
 */
export class LoginResponseDto {
    @ApiProperty({ description: 'The JWT access token' })
    accessToken: string;

    @ApiProperty({ description: 'The authenticated user details' })
    user: UserResponseDto;
}
