const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Simple proxy endpoint: /proxy?url=<ENCODED_URL>
// Forwards Range header and returns resource with CORS headers.
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const resp = await fetch(url, { headers, redirect: 'follow' });

    // copy selected headers to client
    const allowed = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    allowed.forEach(h => {
      const v = resp.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.status(resp.status);
    resp.body.pipe(res);
  } catch (err) {
    res.status(502).send('Proxy error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CORS proxy listening on http://localhost:${PORT}`));
