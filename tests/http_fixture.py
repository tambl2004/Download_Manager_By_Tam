"""Deterministic HTTP test server. Run with Python 3; no external packages."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
import time,re
DATA=bytes(range(256))*65536
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def do_GET(self):
  mode=self.path.split('?')[0];etag='"test-v1"';a,b=0,len(DATA)-1;partial=False
  r=self.headers.get('Range')
  if r and mode!='/no-range':
   m=re.fullmatch(r'bytes=(\d+)-(\d*)',r)
   if not m:self.send_error(400);return
   a=int(m[1]);b=int(m[2]) if m[2] else b
   if a>b or b>=len(DATA):self.send_response(416);self.end_headers();return
   partial=True
  if mode=='/changed' and r!='bytes=0-0':etag='"test-v2"'
  self.send_response(206 if partial else 200)
  self.send_header('Content-Type','application/octet-stream');self.send_header('ETag',etag)
  if partial:self.send_header('Content-Range',f'bytes {a}-{b}/{len(DATA)}')
  self.send_header('Content-Length',str(b-a+1));self.end_headers()
  try:
   for i in range(a,b+1,32768):
    self.wfile.write(DATA[i:min(i+32768,b+1)]);self.wfile.flush()
    if mode=='/slow':time.sleep(.004)
  except (BrokenPipeError,ConnectionResetError):pass
if __name__=='__main__':
 print('Test URL: http://127.0.0.1:8765/range',flush=True)
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
