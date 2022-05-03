//Run: `node server.js`

// const cfg = require('./server_settings.js');
// const fs = require('fs');
// const path = require('path');
// const hotreload = require('./hotreload/hotreload.js');

import * as cfg from './server_settings.js'
import * as fs from 'fs'
import * as path from 'path'
import * as hotreload from './hotreload/hotreload.js'

import { py_wss, py_client } from './relay/python_relay.js';

console.time(`node server started!`);

//when a request is made to the server from a user, what should we do with it?
function onRequest(request, response) {
    if(cfg.settings.debug) console.log('request ', request.url);
    //console.log(request); //debug

    //process the request, in this case simply reading a file based on the request url    
    var requestURL = '.' + request.url;

    if (requestURL == './') { //root should point to start page
        requestURL = cfg.settings.startpage; //point to the start page
    }

    //read the file on the server
    if(fs.existsSync(requestURL)){
        fs.readFile(requestURL, function(error, content) {
            if (error) {
                if(error.code == 'ENOENT') { //page not found: 404
                    fs.readFile(cfg.settings.errpage, function(error, content) {
                        response.writeHead(404, { 'Content-Type': 'text/html' }); //set response headers

                        
                        //add hot reload if specified
                        if(process.env.NODEMON && requestURL.endsWith('.html') && typeof hotreload !== 'undefined') {
                            content = hotreload.addhotload(content);
                        }

                        response.end(content, 'utf-8'); //set response content

                        //console.log(content); //debug
                    });
                }
                else { //other error
                    response.writeHead(500); //set response headers
                    response.end('Something went wrong: '+error.code+' ..\n'); //set response content
                }
            }
            else { //file read successfully, serve the content back

                //set content type based on file path extension for the browser to read it properly
                var extname = String(path.extname(requestURL)).toLowerCase();
                var mimeTypes = {
                    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
                    '.png': 'image/png', '.jpg': 'image/jpg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                    '.wav': 'audio/wav', '.mp4': 'video/mp4',
                    '.woff': 'application/font-woff', '.ttf': 'application/font-ttf', '.eot': 'application/vnd.ms-fontobject', '.otf': 'application/font-otf',
                    '.wasm': 'application/wasm'
                };

                var contentType = mimeTypes[extname] || 'application/octet-stream';

                response.writeHead(200, { 'Content-Type': contentType }); //set response headers

                //html injection
                if(requestURL.endsWith('.html')) {

                    //inject hot reload if specified
                    if(process.env.NODEMON && typeof hotreload !== 'undefined' && cfg.settings.hotreload) {
                        content = hotreload.addhotreload(content,hotreload.socketUrl);
                    }
                    
                    //inject pwa code
                    if(cfg.settings.pwa && cfg.settings.protocol === 'https') {
                        if(fs.existsSync(cfg.settings.pwa)) {
                            if(!fs.existsSync('manifest.webmanifest')) { //lets create a default webmanifest on the local server if none found
                                fs.writeFileSync('manifest.webmanifest',
                                `{
                                    "short_name": "PWA",
                                    "name": "PWA",
                                    "start_url": ".",
                                    "display": "standalone",
                                    "theme_color": "#000000",
                                    "background_color": "#ffffff",
                                    "description": "PWA Test",
                                    "lang": "en-US",
                                    "permissions": [
                                    "storage"
                                    ]
                                }`
                                )
                            }
                            content = `${content.toString()}\n\n
                                <script>
                                    console.log('Using PWA!');  
                                    if(typeof process !== 'undefined') { //node environment variable in served code        
                                        // Check that service workers are supported
                                        if (process.env.NODE_ENV === 'production' && "serviceWorker" in navigator) addEventListener('load', () => {
                                            navigator.serviceWorker
                                            .register("${cfg.settings.pwa}")
                                            .catch((err) => console.log("Service worker registration failed", err));
                                        });
                                    }
                                </script>`;
                        }
                    }

                }

                response.end(content, 'utf-8'); //set response content

                //console.log(content); //debug
            }
        });
    } else {
        if(cfg.settings.debug) console.log(`File ${requestURL} does not exist on path!`);
    }

    //console.log(response); //debug
}



//Websocket upgrading
function onUpgrade(request, socket, head) { //https://github.com/websockets/ws

    if(cfg.settings.debug) console.log("Upgrade request at: ", request.url);
    
    if(request.url === '/' || request.url === '/home') {
        if(typeof py_wss !== 'undefined') {
            py_wss.handleUpgrade(request, socket, head, (ws) => {
                py_wss.emit('connection', ws, request);
            });
        }
    } else if(request.url === '/hotreload') {
        if(typeof hotreload !== 'undefined') {
            hotreload.hotreload.handleUpgrade(request, socket, head, (ws) => {
                hotreload.hotreload.emit('connection', ws, request);
            }); 
        }
    } 
}



//runs when the server starts successfully.
function onStarted() {      
    
    console.timeEnd(`node server started!`);
    console.log(`Server running at 
        ${cfg.settings.protocol}://${cfg.settings.host}:${cfg.settings.port}/`
    );
}

//now create the http/https server. For hosted servers, use the IP and open ports. Default html port is 80 or sometimes 443

import * as http from 'http'
import * as https from 'https'

if(cfg.settings.protocol === 'http') {
    
    //var http = require('http');
    let server = http.createServer(
        onRequest
    );

    server.on('error',(err)=>{
        console.error('onupgrade error:',err.toString());
    })
    
    server.on('upgrade', onUpgrade);

    server.listen( //SITE AVAILABLE ON PORT:
        cfg.settings.port,
        cfg.settings.host,
        onStarted
    );
}
else if (cfg.settings.protocol === 'https') {
    
    //var https = require('https');
    // options are used by the https server
    // pfx handles the certificate file
    var options = {
        key: fs.readFileSync(cfg.settings.keypath),
        cert: fs.readFileSync(cfg.settings.certpath),
        passphrase: "encrypted"
    };
    let server = https.createServer(
        options,
        onRequest
    );

    server.on('error',(err)=>{
        console.error('onupgrade error:',err.toString());
    })
    
    server.on('upgrade', onUpgrade);
    
    server.listen(
        cfg.settings.port,
        cfg.settings.host,
        onStarted
    );

}



function exitHandler(options, exitCode) {

    if(typeof py_client !== 'undefined') py_client.send('kill');

    if (exitCode || exitCode === 0) console.log('EXIT CODE: ',exitCode);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

