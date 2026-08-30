import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['../public/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['../public/index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['../public/styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['../public/app.js', 'text/javascript; charset=utf-8'],
  '/og.png': ['../public/og.png', 'image/png'],
};
const data = { vacancies: [], candidates: [], applications: [], interviews: [] };
const json = (res, payload, status = 200) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); };
const body = (req) => new Promise((resolve, reject) => { let value = ''; req.on('data', (chunk) => { value += chunk; if (value.length > 100000) reject(new Error('large')); }); req.on('end', () => { try { resolve(JSON.parse(value || '{}')); } catch (error) { reject(error); } }); });
const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/bootstrap' && req.method === 'GET') return json(res, { ...data, summary: { vacancies_open: data.vacancies.filter((item) => ['draft','open','paused'].includes(item.status)).length, applications_active: data.applications.length, interviews_today: 0, vacancies_overdue: 0 } });
  if (url.pathname === '/api/vacancies' && req.method === 'POST') { const input = await body(req); if (!clean(input.title)||!clean(input.department)||!clean(input.manager)) return json(res,{error:'Preencha cargo, departamento e gestor.'},400); const now=new Date().toISOString(); const item={id:crypto.randomUUID(),title:clean(input.title),department:clean(input.department),manager:clean(input.manager),quantity:Number(input.quantity)||1,priority:clean(input.priority),status:clean(input.status)||'draft',source:clean(input.source)||'manual',reason:clean(input.reason,2000),sla_days:30,created_at:now,updated_at:now}; data.vacancies.unshift(item); return json(res,{id:item.id},201); }
  if (url.pathname === '/api/candidates' && req.method === 'POST') { const input=await body(req); if(!clean(input.full_name)||!clean(input.email).includes('@')) return json(res,{error:'Informe nome e e-mail válidos.'},400); const now=new Date().toISOString(); let item=data.candidates.find((candidate)=>candidate.email.toLowerCase()===clean(input.email).toLowerCase()); if(!item){item={id:crypto.randomUUID(),full_name:clean(input.full_name),email:clean(input.email),phone:clean(input.phone),source:clean(input.source)||'manual',updated_at:now};data.candidates.unshift(item)} if(input.vacancy_id&&!data.applications.some((application)=>application.candidate_id===item.id&&application.vacancy_id===input.vacancy_id)){const vacancy=data.vacancies.find((entry)=>entry.id===input.vacancy_id);data.applications.unshift({id:crypto.randomUUID(),candidate_id:item.id,candidate_name:item.full_name,vacancy_id:vacancy.id,vacancy_title:vacancy.title,status:'new',updated_at:now});item.vacancy_title=vacancy.title;item.application_status='new'} return json(res,{id:item.id},201); }
  const file = files[url.pathname]; if (!file) { res.writeHead(404); return res.end('Not found'); }
  let contents = await readFile(new URL(file[0], import.meta.url));
  if (file[1].startsWith('text/html')) contents = Buffer.from(contents.toString('utf8').replaceAll('__ORIGIN__', 'http://127.0.0.1:4173'));
  res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-cache' }); res.end(contents);
});

server.listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
