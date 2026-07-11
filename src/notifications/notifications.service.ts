import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import SendGrid from '@sendgrid/mail';
import { ContactRequestDto } from './dto/contact-request.dto';
import { MailDataRequired } from '@sendgrid/mail';
import { ContactRequestsService } from '../contact-requests/contact-requests.service';
import { CreateContactRequestDto } from '../contact-requests/dto/create-contact-request.dto';
@Injectable()
export class NotificationsService {
  private readonly defaultSender: string;
  constructor(private readonly configService: ConfigService,
              private readonly contactRequestService: ContactRequestsService,
  )
  {
    SendGrid.setApiKey(this.configService.get('SENDGRID_API_KEY')!);
    this.defaultSender = this.configService.get('SENDGRID_FROM_EMAIL')!;
  }


  public async sendContactRequestEmail(contactRequestDto: ContactRequestDto){
      const message: MailDataRequired = {
        to: 'empleos@sir.com.gt',
        from: this.defaultSender,
        templateId: 'd-d1b8156969834eaeb01b443c5b67b099',
        dynamicTemplateData: {
          nombre: contactRequestDto.nombre,
          email: contactRequestDto.email,
          empresa: contactRequestDto.empresa,
          mensaje: contactRequestDto.mensaje
        }
      };

       await SendGrid.send(message);
       const dto = new CreateContactRequestDto();
       dto.email = contactRequestDto.email;
       dto.contactName = contactRequestDto.nombre;
       dto.requestDesc = contactRequestDto.mensaje;
       await this.contactRequestService.create(dto);
       return contactRequestDto;
  }

}
