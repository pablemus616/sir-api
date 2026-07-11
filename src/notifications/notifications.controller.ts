import { Body, Controller, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ContactRequestDto } from './dto/contact-request.dto';
import { Public } from '../config/public.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @Post('contact-request')
  public async createContactRequest(
    @Body() createContactRequest: ContactRequestDto,
  ) {
    return await this.notificationsService.sendContactRequestEmail(createContactRequest);
  }
}
