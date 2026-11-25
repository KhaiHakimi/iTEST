// SPECIMEN / TEST app with deliberate bugs, used to check the agent works.
// Plain Node.js, no dependencies. Listens on 127.0.0.1 only.
import {createServer} from 'node:http';

const PORT = Number(process.env.DEMO_PORT ?? 4173);

const layout = (title, body) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <nav>
    <a href="/">Home</a> |
    <a href="/about">About</a> |
    <a href="/apply">Apply</a> |
    <a href="/old-page">Old page</a> |
    <a href="/logout">Log out</a> |
    <a href="https://example.com/">External site</a>
  </nav>
  <main>${body}</main>
</body>
</html>`;

const pages = {
  '/': layout(
    'Demo home',
    `<h1>Demo scholarship portal (SPECIMEN / TEST)</h1>
     <img src="/logo.svg">
     <p id="stats">Loading statistics…</p>
     <script>
       // Bug: the stats API returns 500 and the code does not handle it.
       fetch('/api/stats')
         .then(r => r.json())
         .then(d => { document.getElementById('stats').textContent = d.total; });
       // Bug: uncaught error from a typo.
       setTimeout(() => { undefinedFunction(); }, 100);
     </script>`,
  ),
  '/about': layout(
    'About',
    `<h1>About</h1>
     <p>Static page with a logged error and a third-party script.</p>
     <script src="https://cdn.example.com/analytics.js"></script>
     <script>console.error('Feature flag service not configured');</script>`,
  ),
  '/apply': layout(
    'Apply',
    `<h1>Apply</h1>
     <form>
       <input type="text" name="fullName">
       <input type="number" name="cgpa" placeholder="CGPA">
       <button type="submit"></button>
     </form>`,
  ),
};

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
  '<circle cx="20" cy="20" r="18" fill="#888"/></svg>';

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
  if (pages[path]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(pages[path]);
  } else if (path === '/logo.svg') {
    res.writeHead(200, {'Content-Type': 'image/svg+xml'});
    res.end(LOGO);
  } else if (path === '/api/stats') {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'database unavailable'}));
  } else if (path === '/logout') {
    // If the link checker ever followed this, the demo would show it here.
    console.error('logout was requested: the agent should never follow it');
    res.writeHead(302, {Location: '/'});
    res.end();
  } else {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Demo app on http://127.0.0.1:${PORT}`);
});
