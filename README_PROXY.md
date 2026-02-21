Proxy for testing video CORS

1. Install dependencies:

```bash
npm install
```

2. Start the proxy:

```bash
npm run start-proxy
```

3. Use the proxy URL in the app by prefixing the remote video URL:

Example: http://localhost:3000/proxy?url=https%3A%2F%2Fexample.com%2Fmovie.mp4

Notes:

- The proxy forwards `Range` headers and sets `Access-Control-Allow-Origin: *` so the browser can load remote video resources for testing.
- This is for local testing only. Do not expose this proxy publicly without securing it.
