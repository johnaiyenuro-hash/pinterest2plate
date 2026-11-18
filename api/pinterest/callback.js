module.exports = (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Pinterest Authorization Failed</title><style>body{font-family:sans-serif;padding:40px;text-align:center;background:#0f172a;color:#fff;}</style></head>
      <body>
        <h2 style="color:#ef4444;">Pinterest Authorization Failed</h2>
        <p>${error_description || error}</p>
        <a href="/" style="color:#f43f5e;font-weight:bold;">Return to App</a>
      </body>
      </html>
    `);
  }

  // Success screen passing code back to opener or displaying token instructions
  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pinterest Authorized — P!nterest2Plate</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #111827; border: 1px solid #1f2937; padding: 32px; border-radius: 20px; max-width: 500px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .badge { display: inline-block; padding: 4px 12px; background: rgba(225, 29, 72, 0.2); color: #fb7185; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
        h2 { margin: 0 0 12px; font-size: 24px; font-weight: 800; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
        .code-box { background: #030712; border: 1px solid #374151; padding: 12px; border-radius: 12px; font-family: monospace; font-size: 12px; color: #38bdf8; word-break: break-all; margin-bottom: 20px; user-select: all; }
        .btn { display: inline-block; background: #e11d48; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 14px; transition: background 0.2s; }
        .btn:hover { background: #be123c; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">Connected to Pinterest API</div>
        <h2>Authorization Received!</h2>
        <p>Your Pinterest authorization code has been issued. You can copy this code or return to your meal planner:</p>
        <div class="code-box">${code || 'No code provided'}</div>
        <a href="/" class="btn">Return to P!nterest2Plate</a>
      </div>
    </body>
    </html>
  `);
};
