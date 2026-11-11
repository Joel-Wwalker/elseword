import test from 'node:test';
import assert from 'node:assert/strict';
import {securityHeaders,protectHTML} from '../security-policy.mjs';

test('CSP permits only the configured backend and same-origin scripts',()=>{
 const headers=securityHeaders('https://example.supabase.co');
 assert.match(headers['Content-Security-Policy'],/script-src 'self';/);
 assert.match(headers['Content-Security-Policy'],/connect-src 'self' https:\/\/example.supabase.co;/);
 assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);
 assert.ok(!headers['Content-Security-Policy'].includes('unsafe-eval'));
 assert.ok(!securityHeaders()['Content-Security-Policy'].includes('supabase.co'));
 assert.equal(headers['X-Content-Type-Options'],'nosniff');
 assert.equal(headers['X-Frame-Options'],'DENY');
 assert.match(headers['Permissions-Policy'],/microphone=\(\)/);
 assert.throws(()=>securityHeaders('https://example.com/; script-src *'),/origin/i);
});
test('HTML fallback precedes resources, omits HTTP-only directives and escapes attributes',()=>{
 const html=protectHTML('<html><head><meta charset="utf-8"><script src="app.js"></script></head></html>',securityHeaders('https://example.supabase.co'));
 assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script'));
 assert.ok(!html.includes('frame-ancestors'));
 assert.match(html,/name="referrer" content="strict-origin-when-cross-origin"/);
 assert.throws(()=>protectHTML('no document',securityHeaders()),/head/i);
});
