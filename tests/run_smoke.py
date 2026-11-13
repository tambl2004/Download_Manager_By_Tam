import subprocess,tempfile,threading,hashlib,json,sys
from pathlib import Path
from http_fixture import Handler,DATA,ThreadingHTTPServer
root=Path(__file__).resolve().parents[1]
exe=Path(sys.argv[1]) if len(sys.argv)>1 else root/'target'/'debug'/'examples'/('smoke.exe' if sys.platform=='win32' else 'smoke')
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 for route,pause,success in [('range',False,True),('no-range',False,True),('slow',True,True),('changed',False,False)]:
  with tempfile.TemporaryDirectory() as d:
   r=subprocess.run([str(exe),d,f'http://127.0.0.1:{server.server_port}/{route}']+(['pause'] if pause else []),capture_output=True,text=True,timeout=65)
   if success:
    assert r.returncode==0,r.stderr
    assert hashlib.sha256((Path(d)/'files'/'result.bin').read_bytes()).digest()==hashlib.sha256(DATA).digest()
   else:assert r.returncode!=0 and not (Path(d)/'files'/'result.bin').exists(),r.stdout
   print('PASS',route,'pause/resume' if pause else '')
finally:server.shutdown()
