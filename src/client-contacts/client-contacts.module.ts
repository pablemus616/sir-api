import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContact } from './client-contact.entity';
import { ClientContactsService } from './client-contacts.service';
import { ClientContactsController } from './client-contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientContact])],
  controllers: [ClientContactsController],
  providers: [ClientContactsService],
  exports: [ClientContactsService],
})
export class ClientContactsModule {}
