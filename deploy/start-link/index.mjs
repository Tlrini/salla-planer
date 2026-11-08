// "Start link" for the on/off app server (docs/deploy-cloud.md §2.6). An AWS Lambda function
// (Node.js 22 runtime, Function URL with auth type NONE) that agents open from a bookmark:
//
//   https://<id>.lambda-url.eu-central-1.on.aws/?key=<START_KEY>
//
// It starts the app's EC2 instance and shows a short page in Albanian. Environment variables:
//   START_KEY        long random secret (at least 24 characters), part of the bookmarked link
//   APP_INSTANCE_ID  the app server, e.g. i-0123456789abcdef0
//   APP_URL          https://planner.example.com
// The Lambda role needs ec2:StartInstances on that instance and ec2:DescribeInstances.
// The AWS SDK is part of the Lambda runtime; nothing here is bundled into the app.
// (This page is outside the web app, so its few Albanian texts live here, not in sq.ts.)
import { createHash, timingSafeEqual } from 'node:crypto';
import { DescribeInstancesCommand, EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2';

const ec2 = new EC2Client({});
const START_KEY = process.env.START_KEY ?? '';
const INSTANCE = process.env.APP_INSTANCE_ID ?? '';
const APP_URL = process.env.APP_URL ?? '';

const digest = (s) => createHash('sha256').update(s).digest();
const sameKey = (given) =>
  START_KEY.length >= 24 && timingSafeEqual(digest(given), digest(START_KEY));

const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(statusCode, title, body, refreshSeconds) {
  const refresh = refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : '';
  return {
    statusCode,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    },
    body: `<!doctype html><html lang="sq"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>${escape(title)}</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#f3f5f8;color:#16223a}
  main{max-width:520px;margin:15vh auto 0;padding:24px 16px;text-align:center}
  h1{font-size:24px;margin:0 0 12px}
  a{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:10px;
    background:#c9a44c;color:#16223a;font-weight:600;text-decoration:none}
  @media (prefers-color-scheme:dark){body{background:#11161f;color:#e6ebf3}}
</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`,
  };
}

const openLink = () => (APP_URL ? `<a href="${escape(APP_URL)}">Hap Salla Planner</a>` : '');

export const handler = async (event) => {
  const key = event?.queryStringParameters?.key ?? '';
  if (!sameKey(key))
    return page(403, 'Lidhje e pavlefshme', '<p>Kjo lidhje nuk është e saktë.</p>');
  if (!INSTANCE) return page(500, 'Gabim', '<p>Lidhja nuk është konfiguruar.</p>');

  try {
    const out = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [INSTANCE] }));
    const state = out.Reservations?.[0]?.Instances?.[0]?.State?.Name;
    if (state === 'running')
      return page(
        200,
        'Serveri është i ndezur',
        '<p>Nëse faqja nuk hapet ende, prisni edhe një minutë.</p>' + openLink(),
      );
    if (state === 'stopped') {
      await ec2.send(new StartInstancesCommand({ InstanceIds: [INSTANCE] }));
      return page(
        200,
        'Serveri po ndizet',
        '<p>Hapeni aplikacionin pas rreth 2 minutash. Kjo faqe rifreskohet vetë.</p>',
        20,
      );
    }
    if (state === 'pending')
      return page(200, 'Serveri po ndizet', '<p>Edhe pak… Kjo faqe rifreskohet vetë.</p>', 20);
    if (state === 'stopping')
      return page(
        200,
        'Serveri po fiket',
        '<p>Po fiket pas një periudhe pa përdorim. Kjo faqe e ndez sërish pas pak.</p>',
        20,
      );
    return page(500, 'Gabim', `<p>Gjendje e papritur e serverit: ${escape(String(state))}</p>`);
  } catch (err) {
    console.error(err);
    return page(500, 'Gabim', '<p>Serveri nuk u ndez. Provoni përsëri pas pak.</p>');
  }
};
