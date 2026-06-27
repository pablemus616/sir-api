import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactType } from './contact-type.entity';
import { ContactTypesService } from './contact-types.service';
import { ContactTypesController } from './contact-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactType])],
  controllers: [ContactTypesController],
  providers: [ContactTypesService],
  exports: [ContactTypesService],
})
export class ContactTypesModule {}
