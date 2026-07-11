import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ContactRequestsModule } from '../contact-requests/contact-requests.module';

@Module({
  imports: [ContactRequestsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService]
})
export class NotificationsModule {}
