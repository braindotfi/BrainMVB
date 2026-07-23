import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const indexPath = path.resolve(distPath, "index.html");

  // Log to stdout so it appears in deployment logs
  console.log(`[serveStatic] __dirname=${__dirname}`);
  console.log(`[serveStatic] distPath=${distPath}`);
  console.log(`[serveStatic] distPath exists=${fs.existsSync(distPath)}`);
  console.log(`[serveStatic] index.html exists=${fs.existsSync(indexPath)}`);
  if (fs.existsSync(distPath)) {
    const entries = fs.readdirSync(distPath);
    console.log(`[serveStatic] distPath entries (${entries.length}): ${entries.slice(0, 20).join(", ")}`);
  }

  if (!fs.existsSync(distPath)) {
    app.get("/", (_req, res) => {
      res.status(503).json({ error: "dist/public missing", distPath, cwd: process.cwd() });
    });
    return;
  }

  app.use(express.static(distPath));

  // Explicit GET / handler — Express 5 {*path} may not match root
  app.get("/", (_req: Request, res: Response, next: NextFunction) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.log(`[serveStatic] sendFile error for /: ${err.message}`);
          next(err);
        }
      });
    } else {
      console.log(`[serveStatic] index.html missing at ${indexPath}`);
      res.status(404).json({ error: "index.html not found", indexPath });
    }
  });

  // catch-all for all other paths
  app.use("/{*path}", (req: Request, res: Response, next: NextFunction) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.log(`[serveStatic] sendFile error for ${req.path}: ${err.message}`);
          next(err);
        }
      });
    } else {
      console.log(`[serveStatic] index.html missing at ${indexPath}`);
      res.status(404).json({ error: "index.html not found", indexPath });
    }
  });
}
