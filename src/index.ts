/*
 *     ________________ __
 *    / ____/ ___/ ___// /____  __  _______
 *   / __/  \__ \\__ \/ __/ _ \/ / / / ___/
 *  / /___ ___/ /__/ / /_/  __/ /_/ / /
 * /_____//____/____/\__/\___/\__, /_/
 *                           /____/
 *
 * This file is licensed under The MIT License
 * Copyright (c) 2020 Riegler Daniel
 * Copyright (c) 2020 ESS Engineering Software Steyr GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import express, {Express, NextFunction, Request, Response} from 'express';
import {initAuthenticator, requireAuthentication} from './auth/authenticator';
import gracefulShutdown from 'http-graceful-shutdown';
import respond from './util/respond';
import initSession from './auth/sessionMiddleware';
import {startQueue} from './util/printerUtil';
import {read} from './util/fileSystemUtil';
import queueRouter from './router/queueRouter';
import authRouter from './router/authRouter';
import createHttpError from 'http-errors';
import {serve, setup} from 'swagger-ui-express';
import swaggerConfig from './swagger.json';
import http, {Server} from 'http';
import {json} from 'body-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import https from 'https';
import cors from 'cors';
import env from './env';

// allow self signed/invalid SSL certifications when not in production
/*if (env.isDevelopment)*/
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const BASE_URL: string = `${env.ENCRYPT ? 'https' : 'http'}://${env.HOST}:${
  env.PORT
}`;

(async () => {
  console.log(
    '    ________________ __\n' +
      '   / ____/ ___/ ___// /____  __  _______\n' +
      '  / __/  \\__ \\\\__ \\/ __/ _ \\/ / / / ___/\n' +
      ' / /___ ___/ /__/ / /_/  __/ /_/ / /\n' +
      '/_____//____/____/\\__/\\___/\\__, /_/\n' +
      'https://git.io/JUSCj      /____/\n' +
      '============================================\n'
  );
  if (!env.isProduction) console.warn('Running not in production mode!');
  const app: Express = express();

  // middleware
  if (env.PROXY) app.set('trust proxy', 1);
  app.use(morgan(env.isProduction ? 'tiny' : 'dev'));
  app.use(helmet());
  app.use(json());
  app.use(await initSession());
  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ['set-cookie'],
    })
  );

  // serve swagger api docs
  app.use(
    '/docs',
    serve,
    setup({
      ...swaggerConfig,
      swaggerUrl: BASE_URL,
      servers: [{url: BASE_URL}],
    })
  );

  // redirect root to docs
  app.get('/', (request: Request, response: Response) =>
    response.redirect(301, '/docs')
  );

  // register auth router
  initAuthenticator(app);
  app.use('/auth', authRouter);

  // register queue router
  app.use('/queue', requireAuthentication(), queueRouter);

  // handle 404
  app.use((request: Request, response: Response, next: NextFunction) =>
    next(createHttpError(404))
  );

  // error handler
  /* eslint-disable */
  app.use(
    (error: Error, request: Request, response: Response, _next: NextFunction) =>
      respond(request, response, error)
  );
  /* eslint-enable */

  // start printing queue
  await startQueue();

  // webserver setup
  const server: Server = env.ENCRYPT
    ? https
        .createServer(
          {
            cert: await read(env.CERTIFICATE),
            key: await read(env.PRIVATE_KEY),
          },
          app
        )
        .listen(env.PORT, env.HOST)
    : http.createServer(app).listen(env.PORT, env.HOST);

  server.once('listening', () => {
    gracefulShutdown(server, {
      timeout: 1000 * 10,
      development: env.isDevelopment,
      finally: () => console.log('Server shutdown complete.'),
    });
    console.log(`Server listening on ${BASE_URL}`);
  });
})();
