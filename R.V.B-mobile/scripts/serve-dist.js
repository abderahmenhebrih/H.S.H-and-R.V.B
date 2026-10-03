const http = require("http");
const fs = require("fs");
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const port = 8082;
const mime = {
  ".html":"text/html",
  ".js":"application/javascript",
  ".css":"text/css",
  ".json":"application/json",
  ".png":"image/png",
  ".ico":"image/x-icon",
  ".svg":"image/svg+xml",
};
const server = http.createServer((req,res)=>{
  let url = req.url.split("?")[0];
  if(url==="/") url="/index.html";
  let filePath = path.join(dist, url);
  // Fallback to index.html for SPA
  if(!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()){
    filePath = path.join(dist, "index.html");
  }
  const ext = path.extname(filePath);
  const contentType = mime[ext] || "application/octet-stream";
  try{
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {"Content-Type": contentType});
    res.end(data);
  }catch(e){
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, ()=> console.log(`Serving dist on http://localhost:${port}`));
