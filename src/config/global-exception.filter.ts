import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {

  private logger: Logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const rep = host.switchToHttp().getResponse<FastifyReply>();
    let msg : string = "Internal server error";
    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    if(exception instanceof HttpException){

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      if(exception.getResponse().toString().startsWith("ThrottlerException:")){
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        msg = exception.getResponse().toString().split(": ")[1];
      } else{
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        msg =
          exception.getResponse() instanceof String
            ? exception.getResponse()
            :
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              (exception.getResponse() as any).message;
      }
      code = exception.getStatus();
    } else {
      this.logger.log(exception);
    }

    return rep.code(code).send({
      ok: false,
      message: msg,
      path: req.url
    });

  }
}