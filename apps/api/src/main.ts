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

  // Game bundles are embedded in an iframe by the portal, which runs on a
  // different origin in dev (:3000 vs :4000). Helmet's default
  // X-Frame-Options: SAMEORIGIN would block that, so swap it for a
  // frame-ancestors policy that allows the portal origin.
  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .join(' ');
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (req: any, reply: any, payload: any, done: any) => {
      if (req.url?.startsWith('/g/')) {
        reply.removeHeader('x-frame-options');
        reply.header(
          'content-security-policy',
          `frame-ancestors 'self' ${webOrigins}`,
        );
      }
      done(null, payload);
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
