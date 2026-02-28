import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { NotificationPriority } from '@app/shared';

export class SendNotificationDto {
  @ApiProperty({
    description: 'The title of the notification',
    example: 'System Update',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The body content of the notification',
    example: 'The system will undergo maintenance.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    enum: NotificationPriority,
    default: NotificationPriority.MEDIUM,
    description: 'Priority level of the notification',
  })
  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.MEDIUM;

  @ApiPropertyOptional({
    description:
      'If true, sends the notification to all registered users. Mutually exclusive with userIds.',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  broadcast?: boolean = false;

  @ApiPropertyOptional({
    description:
      'List of user UUIDs to send the notification to. Required when broadcast is false.',
    type: [String],
    example: ['d83c4801-4470-4d8e-9c71-f9c18d022b72'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  userIds?: string[];
}
