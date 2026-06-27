import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class GlobalResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {

    return next
        .handle()
          .pipe(
            map(
              (data: unknown) => ({
                ok: true,
                message: "Success",
                data: data
              })
            )
      );

  }
}