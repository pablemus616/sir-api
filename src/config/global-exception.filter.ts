import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { QueryFailedError } from 'typeorm';

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
    } else if (exception instanceof QueryFailedError) {
      const constraint = this.constraintError(exception);
      if (constraint) {
        // Violación de integridad (p. ej. borrar un cliente con oportunidades): es
        // un error del usuario, no un 500 genérico.
        [code, msg] = constraint;
        this.logger.warn(exception.message);
      } else {
        this.logger.log(exception);
      }
    } else {
      this.logger.log(exception);
    }

    return rep.code(code).send({
      ok: false,
      message: msg,
      path: req.url
    });

  }

  /** Códigos de Postgres: 23503 foreign_key_violation, 23505 unique_violation. */
  private constraintError(exception: {
    message: string;
    driverError: unknown;
  }): [HttpStatus, string] | null {
    const pgCode = (exception.driverError as { code?: string } | undefined)?.code;
    if (pgCode === '23503') {
      return exception.message.startsWith('update or delete')
        ? [HttpStatus.CONFLICT, 'Cannot delete: it has related records']
        : [HttpStatus.BAD_REQUEST, 'Related record not found'];
    }
    if (pgCode === '23505') return [HttpStatus.CONFLICT, 'Record already exists'];
    return null;
  }
}