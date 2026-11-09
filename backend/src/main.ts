import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(logRequests());
  // No uploaded file is public: profile photos go through
  // GET /user/:id/avatar and message images through
  // GET /messaging/messages/:id/image, both checking who's asking.

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MySentinelCircle API')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
// One line per request in the server logs: method, route pattern (never the
// real URL: no ids, no query string), status and duration. Nothing about who
// asked. The uptime check (/health) is left out, it would drown the rest.
function logRequests() {
  const logger = new Logger('HTTP');
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const route = (req.route as { path?: string } | undefined)?.path;
      logger.log(
        `${req.method} ${route ? req.baseUrl + route : '(no route)'} ${res.statusCode} ${Date.now() - start}ms`,
      );
    });
    next();
  };
}

void bootstrap();
