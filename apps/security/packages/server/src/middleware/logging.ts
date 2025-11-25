export function logRequest(req: Request, status: number, duration: number) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: req.method,
    path: new URL(req.url).pathname,
    status,
    duration: `${duration}ms`,
  }));
}
