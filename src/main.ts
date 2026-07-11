import { NestFactory } from '@nestjs/core';
import { MainModule } from './main.module';
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import fastifyHelmet from "@fastify/helmet";
import {GlobalExceptionFilter} from "./config/global-exception.filter";
import {GlobalResponseInterceptor} from "./config/global-response.interceptor";
import {ValidationPipe} from "@nestjs/common";
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(MainModule, new FastifyAdapter());
  await app.register(fastifyHelmet);
  app.setGlobalPrefix("/api");
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new GlobalResponseInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true
  }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
