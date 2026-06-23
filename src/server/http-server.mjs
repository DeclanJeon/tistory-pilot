import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { buildServerContext } from './context.mjs';
import { createSessionCookie, isAuthenticated } from './auth.mjs';
import { createEmailAuthService } from './email-auth-service.mjs';
import { BlogService } from './blog-service.mjs';
import { JobService, analyzeMarkdownSource } from './job-service.mjs';


function getStaticRoot(options = {}) {
  return path.resolve(options.projectRoot || process.cwd(), 'src/server/static');
}


function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function noContent(response, headers = {}) {
  response.writeHead(204, headers);
  response.end();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(response, filePath, contentType) {
  const content = await fs.readFile(filePath);
  response.writeHead(200, { 'content-type': contentType });
  response.end(content);
}

function notFoundJson(response, error = 'not-found') {
  json(response, 404, { error });
}

function notFound(response) {
  notFoundJson(response);
}
function emailAuthErrorStatus(error) {
  if (error?.code === 'invalid-email') return 400;
  if (error?.code === 'email-not-allowed') return 403;
  if (error?.code === 'email-auth-disabled' || error?.code === 'email-auth-not-configured') return 503;
  return 500;
}


export async function createHttpServer(options = {}) {
  const context = await buildServerContext(options);
  const staticRoot = getStaticRoot(options);
  const blogService = new BlogService(context);
  const jobService = new JobService(context);
  const emailAuthService = options.emailAuthService || createEmailAuthService(context.config);



  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const authenticated = true;

      if (request.method === 'GET' && url.pathname === '/') {
        await serveStatic(response, path.join(staticRoot, 'index.html'), 'text/html; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/app.js') {
        await serveStatic(response, path.join(staticRoot, 'app.js'), 'application/javascript; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/publish-inference.js') {
        await serveStatic(response, path.join(staticRoot, 'publish-inference.js'), 'application/javascript; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/body-asset-utils.js') {
        await serveStatic(response, path.join(staticRoot, 'body-asset-utils.js'), 'application/javascript; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/styles.css') {
        await serveStatic(response, path.join(staticRoot, 'styles.css'), 'text/css; charset=utf-8');
        return;
      }
      if (url.pathname === '/api/session' && request.method === 'GET') {
        json(response, 200, {
          authenticated,
          auth: {
            emailEnabled: Boolean(context.config.authEmail?.enabled),
            passwordEnabled: Boolean(context.config.sessionSecret)
          }
        });
        return;
      }
      if (url.pathname === '/api/session' && request.method === 'POST') {
        const body = await readBody(request);
        if (String(body.password || '') !== context.config.sessionSecret) {
          json(response, 401, { error: 'invalid-password' });
          return;
        }
        noContent(response, { 'set-cookie': createSessionCookie(context.config) });
        return;
      }
      if (url.pathname === '/api/session/email/request' && request.method === 'POST') {
        const body = await readBody(request);
        try {
          const result = await emailAuthService.requestCode({ email: body.email });
          json(response, 202, result);
        } catch (error) {
          json(response, emailAuthErrorStatus(error), { error: error?.code || 'email-auth-error' });
        }
        return;
      }
      if (url.pathname === '/api/session/email/verify' && request.method === 'POST') {
        const body = await readBody(request);
        try {
          const verified = await emailAuthService.verifyCode({ email: body.email, code: body.code });
          if (!verified) {
            json(response, 401, { error: 'invalid-code' });
            return;
          }
          noContent(response, { 'set-cookie': createSessionCookie(context.config) });
        } catch (error) {
          json(response, emailAuthErrorStatus(error), { error: error?.code || 'email-auth-error' });
        }
        return;
      }
      if (url.pathname === '/api/templates' && request.method === 'GET') {
        json(response, 200, { templates: jobService.getTemplateCatalog() });
        return;
      }
      if (url.pathname === '/api/blogs' && request.method === 'GET') {
        json(response, 200, { blogs: await blogService.listBlogs() });
        return;
      }
      if (url.pathname === '/api/blogs' && request.method === 'POST') {
        const body = await readBody(request);
        json(response, 201, {
          blogs: await blogService.saveBlog({
            accountName: String(body.accountName || 'default'),
            blogUrl: String(body.blogUrl || ''),
            blogTitle: String(body.blogTitle || '')
          })
        });
        return;
      }
      if (url.pathname === '/api/analyze' && request.method === 'POST') {
        const body = await readBody(request);
        if (body.markdown) {
          const draft = analyzeMarkdownSource(body.markdown, {
            templateId: String(body.templateId || ''),
            description: String(body.description || '')
          });
          json(response, 200, { mode: 'markdown', draft, analysis: draft.analysis });
          return;
        }
        if (Array.isArray(body.links) && body.links.length > 0) {
          const job = await jobService.createSourceImportJob({ createdBy: 'web', blogUrl: String(body.blogUrl || ''), links: body.links });
          json(response, 202, { mode: 'links', job });
          return;
        }
        json(response, 400, { error: 'missing-source-input' });
        return;
      }
      if (url.pathname === '/api/jobs' && request.method === 'GET') {
        json(response, 200, { jobs: await jobService.listJobs() });
        return;
      }
      if (url.pathname === '/api/jobs' && request.method === 'POST') {
        const body = await readBody(request);
        if (body.type === 'publish_post') {
          const job = await jobService.createPublishJob({
            createdBy: 'web',
            blogUrl: String(body.blogUrl || ''),
            title: String(body.title || ''),
            body: String(body.body || ''),
            description: String(body.description || ''),
            tags: String(body.tags || ''),
            category: String(body.category || ''),
            heroImagePath: String(body.heroImagePath || ''),
            sourceBundle: body.sourceBundle || null
          });
          json(response, 201, { job });
          return;
        }
        if (body.type === 'category_ensure') {
          const job = await jobService.createCategoryEnsureJob({ createdBy: 'web', blogUrl: String(body.blogUrl || ''), category: String(body.category || '') });
          json(response, 201, { job });
          return;
        }
        json(response, 400, { error: 'unsupported-job-type' });
        return;
      }
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (jobMatch && request.method === 'GET') {
        const jobId = decodeURIComponent(jobMatch[1]);
        let job;
        try {
          job = await jobService.getJob(jobId);
        } catch (error) {
          if (error?.code === 'ENOENT') {
            notFoundJson(response, 'job-not-found');
            return;
          }
          throw error;
        }
        json(response, 200, {
          job,
          events: await jobService.readJobEvents(jobId),
          artifacts: await jobService.resolveJobArtifacts(jobId, job.artifactRefs)
        });
        return;
      }
      const eventsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
      if (eventsMatch && request.method === 'GET') {
        const jobId = decodeURIComponent(eventsMatch[1]);
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        let lastCount = 0;
        const tick = async () => {
          const events = await jobService.readJobEvents(jobId);
          const next = events.slice(lastCount);
          lastCount = events.length;
          for (const event of next) {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        };
        await tick();
        const timer = setInterval(() => {
          tick().catch(() => {
            clearInterval(timer);
            response.end();
          });
        }, 1000);
        request.on('close', () => clearInterval(timer));
        return;
      }

      notFound(response);
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    context,
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(context.config.web.port, context.config.web.host, resolve);
      });
      return `http://${context.config.web.host}:${context.config.web.port}`;
    }
  };
}
