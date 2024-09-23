const net = require("net");
const fs = require("fs");
const zlib = require("zlib");

const directory = process.argv.reduce((state, arg) => {
  switch (state) {
    case undefined:
      return arg == "--directory" ? arg : state;
    case "--directory":
      return arg;
    default:
      return state;
  }
}, undefined);
if (directory) {
  console.log("files directory set to ", directory);
}
const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    const request = data.toString();
    const [head, body] = request.split("\r\n\r\n");
    const [requestLine, ...headerLines] = head.split("\r\n");
    const [method, url] = requestLine.split(" ");
    const segments = url.split("/").slice(1);
    const headers =
      Object.fromEntries(
        headerLines.map((headerLine) => headerLine.split(": ", 2)) || [],
      ) || {};
    switch (segments[0]) {
      case "":
        socket.write(httpResponse("200 OK"));
        break;
      case "files":
        switch (method) {
          case "GET":
            const file = findFile(segments[1]);
            file
              ? socket.write(fileResponse(file))
              : socket.write(httpResponse("404 Not Found"));
            break;
          case "POST":
            writeFile(segments[1], body);
            socket.write(httpResponse("201 Created"));
            break;
        }
        break;
      case "user-agent":
        socket.write(textResponse(headers["User-Agent"]));
        break;
      case "echo":
        const responseBody = segments[1];
        const extraHeaders = [];
        
        if (headers["Accept-Encoding"]) {
            const encodings = headers['Accept-Encoding'].split(", ");
            const avlEncodings = ['gzip'];
            let encode = [];

            for(let item of encodings){
                if(avlEncodings.includes(item)){
                    encode.push(item);
                }
            }
            encode = encode.join(", ");

            zlib.gzip(responseBody, (err, compressedBody) => {
                if (err) {
                    socket.write(httpResponse("500 Internal Server Error"));
                } else {
                    if(encode.length > 0)
                        extraHeaders.push(['Content-Encoding', encode]);

                    console.log("resp => ", textResponse(compressedBody, extraHeaders, true));
                    socket.write(textResponse(compressedBody, extraHeaders, true));
                }
            });
        } else {
          socket.write(textResponse(responseBody));
        }
        break;
      default:
        socket.write(httpResponse("404 Not Found"));
    }
  });
  socket.on("close", () => {
    socket.end();
  });
});
server.listen(4221, "localhost");

function textResponse(body, extraHeaders = []) {
  const headers = [
    ["Content-Type", "text/plain"],
    ["Content-Length", body.length],
    ...extraHeaders,
  ];
  return httpResponse("200 OK", headers, body);
}

function httpResponse(status, headers = [], body = "") {
  const statusLine = `HTTP/1.1 ${status}\r\n`;
  const headerLines = headers
    .map(([key, value]) => `${key}:  ${value}\r\n`)
    .join("");
  return `${statusLine}${headerLines}\r\n${body}`;
}

function findFile(filename) {
  const path = `${directory}/${filename}`;
  return fs.existsSync(path) && fs.openSync(path);
}

function writeFile(filename, body) {
  const path = `${directory}/${filename}`;
  fs.writeFileSync(path, body);
}

function fileResponse(fd, extraHeaders = []) {
  const body = fs.readFileSync(fd);
  const headers = [
    ["Content-Type", "application/octet-stream"],
    ["Content-Length", body.length],
    ...extraHeaders,
  ];
  return httpResponse("200 OK", headers, body);
}

