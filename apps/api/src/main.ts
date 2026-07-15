import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  await app.register(fastifyCookie as any);
  await app.register(fastifyHelmet as any, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(fastifyMultipart as any, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // Dev convenience: serve uploaded game bundles at /g/... (Caddy does this in prod)
  const storageDir = path.resolve(
    process.cwd(),
    process.env.GAMES_STORAGE_DIR ?? '../../storage/games',
  );
  await app.register(fastifyStatic as any, {
    root: storageDir,
    prefix: '/g/',
    decorateReply: false,
  });

  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('GameHub API')
    .setDescription('H5 minigame portal API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`GameHub API listening on :${port} (storage: ${storageDir})`);
}

bootstrap();
