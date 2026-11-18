const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../apps/chrome-extension/background.js'),'utf8');
function env({failAdd=false,failCancel=false,complete=false,mode='auto',allowDomains='example.com',hasCookies=false,sessionSites=[]}={}){
  let listener;const calls=[];
  const chrome={
    runtime:{
      lastError:null,
      onInstalled:{addListener(){}},
      onMessage:{addListener(){}},
      sendNativeMessage(_,m,cb){
        calls.push(m.op);
        if(m.op==='add'){
          if(m.cookies)calls.push('with-cookies');
          if(m.source)calls.push('source:'+m.source);
        }
        cb(m.op==='add'&&failAdd?{ok:false}:{ok:true,id:m.id,version:2})
      }
    },
    contextMenus:{create(){},onClicked:{addListener(){}}},
    storage:{local:{
      async get(){return{mode,allowDomains,blockDomains:'',allowSubdomains:false,sessionSites}},
      async set(){}
    }},
    downloads:{
      onCreated:{addListener(f){listener=f}},
      async search(){return[{state:complete?'complete':'in_progress'}]},
      async cancel(){calls.push('chrome-cancel');if(failCancel)throw Error('failed')}
    },
    permissions:{
      async contains(p){
        if(p.permissions&&p.permissions.includes('cookies'))return hasCookies;
        if(p.origins)return hasCookies;
        return false;
      },
      async request(){return true},
      async remove(){return true}
    },
    cookies:{
      async getAll(){return hasCookies?[{name:'session',value:'abc123'}]:[]}
    },
    tabs:{
      async query(){return[{url:'https://example.com/page',active:true}]}
    }
  };
  vm.runInNewContext(code,{chrome,URL,crypto:require('node:crypto').webcrypto});
  return{calls,run:()=>listener({id:1,url:'https://example.com/a.zip',state:'in_progress',danger:'safe'})}
}
test('auto mode: persist held before cancellation; release only afterward',async()=>{
  const e=env();await e.run();
  assert.ok(e.calls.includes('add'));
  assert.ok(e.calls.includes('chrome-cancel'));
  assert.ok(e.calls.includes('resume'));
});
test('host failure preserves Chrome',async()=>{
  const e=env({failAdd:true});await e.run();
  assert.deepEqual(e.calls.filter(c=>!c.startsWith('source:')),['add']);
});
test('cancel failure cancels held desktop task',async()=>{
  const e=env({failCancel:true});await e.run();
  assert.ok(e.calls.includes('add'));
  assert.ok(e.calls.includes('chrome-cancel'));
  assert.ok(e.calls.includes('cancel'));
});
test('completed Chrome task is not downloaded twice',async()=>{
  const e=env({complete:true});await e.run();
  assert.ok(e.calls.includes('add'));
  assert.ok(e.calls.includes('cancel'));
  assert.ok(!e.calls.includes('resume'));
});
test('off mode does nothing',async()=>{
  const e=env({mode:'off'});await e.run();
  assert.deepEqual(e.calls,[]);
});
test('ask mode holds task without cancelling Chrome',async()=>{
  const e=env({mode:'ask'});await e.run();
  assert.ok(e.calls.includes('add'));
  assert.ok(!e.calls.includes('chrome-cancel'));
  assert.ok(!e.calls.includes('resume'));
});
test('cookies are forwarded when session site matches',async()=>{
  const e=env({hasCookies:true,sessionSites:['example.com']});await e.run();
  assert.ok(e.calls.includes('with-cookies'));
});
test('source field is set to chrome',async()=>{
  const e=env();await e.run();
  assert.ok(e.calls.includes('source:chrome'));
});
test('downloadMedia operation sends task to native host with source chrome', async () => {
  let msgListener;
  const calls = [];
  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { msgListener = fn; } },
      sendNativeMessage(_, m, cb) {
        calls.push(m.op);
        if (m.source) calls.push('source:' + m.source);
        cb({ ok: true, id: m.id, version: 2 });
      }
    },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    storage: { local: { async get() { return {}; }, async set() {} } },
    downloads: { onCreated: { addListener() {} } },
    permissions: { async contains() { return false; } }
  };
  vm.runInNewContext(code, { chrome, URL, crypto: require('node:crypto').webcrypto });
  assert.ok(msgListener);
  await new Promise((resolve) => {
    msgListener({ op: 'downloadMedia', stream: { url: 'https://video.example.com/test.mp4', name: 'test.mp4' } }, {}, (res) => {
      resolve(res);
    });
  });
  assert.ok(calls.includes('add'));
  assert.ok(calls.includes('source:chrome'));
});
