const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p=req.url.split('?')[0];if(p==='/'||!path.extname(p))p='/index.html';
  const f=path.join(__dirname,path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end('Not found')}
    res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(d)});
}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Word Detective running'));
