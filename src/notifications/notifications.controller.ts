import { Body, Controller, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ContactRequestDto } from './dto/contact-request.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('contact-request')
  public async createContactRequest(
    @Body() createContactRequest: ContactRequestDto,
  ) {
    return await this.notificationsService.sendContactRequestEmail(createContactRequest);
  }
}
